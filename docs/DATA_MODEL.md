# Data Model and Contracts

## 1. Modeling rule

Keep these concepts separate:

```text
Capture
  = one shared Reel/source

AI Job
  = one Work processing attempt

Candidate
  = one AI-proposed place/website

Entity
  = one user-confirmed canonical place/website

Entity Source
  = provenance linking a confirmed entity back to a capture
```

This prevents AI retries from corrupting saved data and allows several Reels to point to the same place.

---

## 2. Core tables

The SQL below is illustrative. Final migrations should use Supabase/Postgres types and RLS policies explicitly.

### `captures`

```sql
create table captures (
  id uuid primary key,
  owner_id uuid not null,
  platform text not null check (platform in ('instagram')),
  original_url text not null,
  canonical_url text not null,
  source_fingerprint text not null,
  creator_handle text,
  status text not null,
  acquisition_attempt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (owner_id, source_fingerprint)
);
```

Do not put raw video bytes in Postgres.

### `capture_artifacts`

```sql
create table capture_artifacts (
  id uuid primary key,
  capture_id uuid not null references captures(id) on delete cascade,
  kind text not null,
  storage_path text,
  text_content text,
  media_timestamp_ms integer,
  sha256 text,
  byte_size bigint,
  mime_type text,
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
```

Allowed `kind` values should be constrained in migrations, for example:

- `caption`
- `transcript`
- `frame`
- `thumbnail`
- `source_video`
- `source_audio`
- `metadata`

Text artifacts can store bounded text inline. Binary artifacts live in temporary storage.

### `ai_jobs`

```sql
create table ai_jobs (
  id uuid primary key,
  capture_id uuid not null references captures(id) on delete cascade,
  attempt integer not null,
  status text not null,
  work_secret_hash text not null,
  work_secret_expires_at timestamptz not null,
  trigger_idempotency_key text not null,
  trigger_transport_id text,
  trigger_sent_at timestamptz,
  opened_at timestamptz,
  result_received_at timestamptz,
  result_sha256 text,
  created_at timestamptz not null default now(),
  unique (capture_id, attempt),
  unique (trigger_idempotency_key)
);
```

Never store the plaintext Work secret.

### `ai_raw_results`

```sql
create table ai_raw_results (
  id uuid primary key,
  ai_job_id uuid not null unique references ai_jobs(id) on delete cascade,
  payload jsonb not null,
  payload_sha256 text not null,
  schema_version integer not null,
  created_at timestamptz not null default now()
);
```

Raw results are immutable after insert.

### `candidates`

```sql
create table candidates (
  id uuid primary key,
  capture_id uuid not null references captures(id) on delete cascade,
  ai_job_id uuid not null references ai_jobs(id) on delete cascade,
  ordinal integer not null,
  kind text not null check (kind in ('place', 'website')),
  display_name text not null,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  verification_status text not null,
  payload jsonb not null,
  review_status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (ai_job_id, ordinal)
);
```

`payload` preserves candidate-specific structured fields from the versioned Work contract.

### `entities`

```sql
create table entities (
  id uuid primary key,
  owner_id uuid not null,
  kind text not null check (kind in ('place', 'website')),
  name text not null,
  canonical_key text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

`canonical_key` is advisory for duplicate matching; it is not globally unique in V1 because real-world identity is messy.

### `entity_sources`

```sql
create table entity_sources (
  id uuid primary key,
  entity_id uuid not null references entities(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  candidate_id uuid references candidates(id),
  source_url text not null,
  evidence_summary jsonb,
  created_at timestamptz not null default now(),
  unique (entity_id, capture_id)
);
```

### `audit_events`

```sql
create table audit_events (
  id bigserial primary key,
  owner_id uuid,
  capture_id uuid,
  ai_job_id uuid,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Audit rows are append-only from application code.

---

## 3. Capture state

Do not encode every attempt detail only in `captures.status`; attempt-specific detail belongs in `ai_jobs` and acquisition events.

Suggested capture statuses:

```text
RECEIVED
QUEUED_FOR_ACQUISITION
ACQUIRING
NEEDS_MANUAL_MEDIA
ACQUISITION_FAILED
EVIDENCE_READY
AI_TRIGGER_QUEUED
AI_TRIGGER_SENT
AI_OPENED
AI_STALLED
CANDIDATES_READY
NEEDS_REVIEW
CONFIRMED
MEDIA_PURGED
CANCELLED
```

Allowed transitions should be enforced in server code and covered by tests.

---

## 4. Work result contract

Canonical schema lives at:

```text
contracts/work-result.schema.json
```

Conceptual shape:

```json
{
  "schema_version": 1,
  "job_id": "uuid",
  "attempt": 1,
  "candidates": [
    {
      "kind": "place",
      "name": "Cafe Onion Seongsu",
      "confidence": 0.94,
      "verification_status": "verified",
      "place": {
        "address": "optional",
        "locality": "Seoul",
        "region": "Seoul",
        "country": "South Korea",
        "latitude": null,
        "longitude": null
      },
      "website": {
        "observed_url": null,
        "official_url": "https://..."
      },
      "evidence": [
        {
          "source": "transcript",
          "timestamp_ms": 14000,
          "text": "..."
        }
      ],
      "verification_sources": [
        {
          "url": "https://...",
          "title": "...",
          "supports": "branch/address"
        }
      ],
      "notes": null
    }
  ],
  "warnings": []
}
```

---

## 5. Candidate rules

### `kind = place`

Required:

- `name`
- evidence
- confidence
- verification status

Optional:

- address
- locality
- region
- country
- coordinates
- observed/official website

Coordinates must be omitted/null unless independently supported. The model must not geocode from guesswork.

### `kind = website`

Required:

- name
- website URL
- evidence
- confidence
- verification status

Website candidates should indicate whether the URL was:

- directly observed; or
- independently verified.

### Verification status

Allowed:

- `observed` — directly present in evidence but not independently checked;
- `verified` — independently corroborated;
- `probable` — strong inference but not fully verified;
- `conflict` — credible evidence points to multiple possibilities;
- `unverified` — candidate retained but verification unavailable.

---

## 6. Evidence references

Allowed evidence source types:

- `caption`
- `transcript`
- `frame`
- `source_metadata`

Evidence item:

```json
{
  "source": "frame",
  "timestamp_ms": 12000,
  "text": "ONION",
  "artifact_id": "optional-uuid"
}
```

Rules:

- `timestamp_ms` is used only for time-based media evidence;
- `text` is a short supporting excerpt, not the full transcript;
- never include secrets or cookies;
- server may resolve an artifact reference to show the original evidence during review.

---

## 7. Immutable raw result + normalized candidates

When Work submits:

1. validate JSON Schema;
2. canonicalize JSON serialization;
3. compute SHA-256;
4. insert immutable `ai_raw_results`;
5. create one `candidates` row per candidate;
6. transition capture to `CANDIDATES_READY`.

If the exact same payload is submitted again for the same attempt:

- return success;
- do not create duplicate candidates.

If a different payload is submitted after the attempt already has a result:

- reject with conflict;
- audit it;
- require a new attempt to replace candidates.

---

## 8. Confirmation transaction

Confirm selected candidates in one database transaction.

For each selected candidate:

1. apply user edits;
2. check chosen existing entity/merge target;
3. otherwise create new entity;
4. create `entity_sources` link;
5. mark candidate review status;
6. audit decision.

After all selected candidates:

7. mark rejected candidates if user finalized review;
8. set capture `CONFIRMED`;
9. schedule temporary artifact cleanup.

The confirmation endpoint accepts an explicit review revision so a stale browser tab cannot overwrite a newer edit.

---

## 9. Entity shapes

### Place

Example `entities.data`:

```json
{
  "address": "33 ...",
  "locality": "Seoul",
  "region": "Seoul",
  "country": "South Korea",
  "latitude": null,
  "longitude": null,
  "official_url": "https://...",
  "external_refs": [
    {
      "provider": "naver-map-url",
      "value": "https://..."
    }
  ]
}
```

### Website

```json
{
  "url": "https://example.com/path",
  "domain": "example.com",
  "title": "Example",
  "relation": "observed"
}
```

Do not over-model before real usage shows which fields matter.

---

## 10. Duplicate hints

### Website

Normalize:

- lowercase host;
- remove default ports;
- remove known tracking query params;
- normalize trailing slash conservatively;
- preserve meaningful path/query.

Candidate duplicate hint can use:

```text
normalized_origin + normalized_significant_path
```

### Place

Compute a non-authoritative hint from:

```text
normalize(name) + "|" + normalize(address)
```

If address is absent, do not auto-merge.

Fuzzy matching is UI assistance only.

---

## 11. RLS outline

Every owner-visible table must be protected.

Typical policy shape:

```sql
owner_id = auth.uid()
```

For tables without direct `owner_id`, policy joins through `captures` or `entities`.

Work callback access does **not** use Supabase client/RLS sessions. It goes through server endpoints that authorize the narrow Work session explicitly.

The local worker also never receives direct broad database credentials.

---

## 12. Storage layout

Temporary bucket:

```text
evidence/
  <owner-internal-id>/
    <capture-id>/
      <acquisition-attempt>/
        source.mp4
        source.m4a
        frame-0001.webp
        frame-0002.webp
        ...
```

Permanent storage should normally be unnecessary for V1 unless a small retained thumbnail is desired.

Database paths are authoritative; directory names are not authorization.

---

## 13. Retention fields

Every temporary artifact has:

- `expires_at`;
- `deleted_at`.

Cleanup query concept:

```sql
where expires_at < now()
  and deleted_at is null
```

Deletion flow:

1. delete object bytes;
2. mark metadata `deleted_at`;
3. append audit event.

If storage deletion fails, leave `deleted_at` null so cleanup retries.

---

## 14. Versioning

Version all external-ish contracts:

- Work trigger envelope: `SCHEMA=1`;
- Work result: `schema_version`;
- evidence bundle: `schema_version`.

Do not silently change a schema used by an existing Work task.

When schema 2 is introduced:

- parser supports the required migration window;
- Work task prompt is updated;
- new jobs declare schema 2;
- old in-flight jobs can finish under schema 1.
