-- Phase 0 durable Work capability storage.
-- These tables are server-only. No anon/authenticated RLS policies are created.

create table if not exists public.phase0_work_jobs (
  id uuid primary key,
  attempt integer not null check (attempt >= 1),
  secret_hash text not null check (length(secret_hash) = 64),
  secret_expires_at timestamptz not null,
  status text not null check (
    status in (
      'AI_TRIGGER_QUEUED',
      'AI_TRIGGER_SENT',
      'AI_OPENED',
      'AI_STALLED',
      'CANDIDATES_READY'
    )
  ),
  result_sha256 text check (result_sha256 is null or length(result_sha256) = 64),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.phase0_work_results (
  job_id uuid not null references public.phase0_work_jobs(id) on delete cascade,
  attempt integer not null check (attempt >= 1),
  sha256 text not null check (length(sha256) = 64),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, attempt)
);

create table if not exists public.phase0_work_candidates (
  job_id uuid not null,
  attempt integer not null,
  ordinal integer not null check (ordinal >= 0),
  kind text not null check (kind in ('place', 'website')),
  display_name text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  verification_status text not null check (
    verification_status in ('observed', 'verified', 'probable', 'conflict', 'unverified')
  ),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, attempt, ordinal),
  foreign key (job_id, attempt)
    references public.phase0_work_results(job_id, attempt)
    on delete cascade
);

alter table public.phase0_work_jobs enable row level security;
alter table public.phase0_work_results enable row level security;
alter table public.phase0_work_candidates enable row level security;

revoke all on table public.phase0_work_jobs from public, anon, authenticated;
revoke all on table public.phase0_work_results from public, anon, authenticated;
revoke all on table public.phase0_work_candidates from public, anon, authenticated;

create or replace function public.phase0_rotate_work_job(
  p_job_id uuid,
  p_secret_hash text,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_attempt integer;
begin
  if length(p_secret_hash) <> 64 then
    raise exception 'invalid secret hash';
  end if;

  insert into public.phase0_work_jobs (
    id,
    attempt,
    secret_hash,
    secret_expires_at,
    status,
    result_sha256,
    opened_at,
    updated_at
  )
  values (
    p_job_id,
    1,
    p_secret_hash,
    p_expires_at,
    'AI_TRIGGER_SENT',
    null,
    null,
    now()
  )
  on conflict (id) do update
    set attempt = public.phase0_work_jobs.attempt + 1,
        secret_hash = excluded.secret_hash,
        secret_expires_at = excluded.secret_expires_at,
        status = 'AI_TRIGGER_SENT',
        result_sha256 = null,
        opened_at = null,
        updated_at = now()
  returning attempt into v_attempt;

  return v_attempt;
end;
$$;

create or replace function public.phase0_commit_work_result(
  p_job_id uuid,
  p_attempt integer,
  p_sha256 text,
  p_payload jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_attempt integer;
  v_existing_sha text;
begin
  if length(p_sha256) <> 64 then
    raise exception 'invalid sha256';
  end if;

  -- Serializes submissions for the same job so two serverless requests cannot
  -- both observe an empty result slot and insert independently.
  select attempt
    into v_attempt
    from public.phase0_work_jobs
    where id = p_job_id
    for update;

  if not found or v_attempt <> p_attempt then
    raise exception 'stale work attempt';
  end if;

  select sha256
    into v_existing_sha
    from public.phase0_work_results
    where job_id = p_job_id
      and attempt = p_attempt;

  if found then
    if v_existing_sha = p_sha256 then
      return 'replay';
    end if;
    return 'conflict';
  end if;

  insert into public.phase0_work_results (
    job_id,
    attempt,
    sha256,
    payload
  )
  values (
    p_job_id,
    p_attempt,
    p_sha256,
    p_payload
  );

  insert into public.phase0_work_candidates (
    job_id,
    attempt,
    ordinal,
    kind,
    display_name,
    confidence,
    verification_status,
    payload
  )
  select
    p_job_id,
    p_attempt,
    candidate.ordinality::integer - 1,
    candidate.value->>'kind',
    candidate.value->>'name',
    (candidate.value->>'confidence')::numeric,
    candidate.value->>'verification_status',
    candidate.value
  from jsonb_array_elements(
    coalesce(p_payload->'candidates', '[]'::jsonb)
  ) with ordinality as candidate(value, ordinality);

  update public.phase0_work_jobs
    set result_sha256 = p_sha256,
        status = 'CANDIDATES_READY',
        updated_at = now()
    where id = p_job_id
      and attempt = p_attempt;

  return 'accept';
end;
$$;

revoke all on function public.phase0_rotate_work_job(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.phase0_rotate_work_job(uuid, text, timestamptz)
  to service_role;

revoke all on function public.phase0_commit_work_result(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.phase0_commit_work_result(uuid, integer, text, jsonb)
  to service_role;