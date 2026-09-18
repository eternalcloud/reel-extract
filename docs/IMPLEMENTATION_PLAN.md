# Implementation Plan

## 1. Objective

Implement the V1 flow:

```text
Share Instagram Reel
→ capture created
→ local worker builds evidence
→ Gmail triggers ChatGPT Work
→ Work extracts candidate places/websites
→ user reviews
→ user confirms
→ canonical entities saved
→ temporary media purged
```

The implementation must preserve these invariants:

1. No metered LLM API dependency.
2. AI output never becomes canonical without explicit user confirmation.
3. Instagram acquisition remains replaceable behind an adapter.
4. Every external boundary is retryable and idempotent.
5. No Instagram credentials or browser cookies are stored in cloud services.
6. Work gets only job-scoped read-evidence / submit-candidates capability.
7. Raw media is temporary by default.
8. Every nonterminal state has a recovery path; no permanent spinner states.

---

## 2. Build strategy

Build risk-first, not screen-first.

```text
Phase 0  Work capability spike
   ↓
Phase 1  App/data foundation
   ↓
Phase 2  Android Share Target
   ↓
Phase 3  Worker protocol
   ↓
Phase 4  Instagram acquisition spike
   ↓
Phase 5  Evidence preparation
   ↓
Phase 6  Production Work trigger
   ↓
Phase 7  Candidate review + confirmation
   ↓
Phase 8  Library + retention
   ↓
Phase 9  Hardening + operational readiness
```

Two uncertainties must be resolved before significant UI polish:

- whether ChatGPT Work can complete the Gmail-triggered job and unattended scoped callback;
- how reliably the selected local acquisition adapter can obtain representative Instagram Reels.

Everything else should depend on stable interfaces, not on either implementation detail.

### Stop/go rule

A phase is complete only when its acceptance criteria pass. A failed external capability test must select the documented fallback before later phases depend on it.

Do not temporarily bypass security or idempotency to make a demo pass.

---

# Phase 0 — Prove the Work loop

## Goal

Prove the unusual part of the architecture before building Instagram acquisition:

```text
Synthetic evidence
→ Gmail trigger
→ Work starts
→ Work opens scoped job page
→ Work analyses evidence
→ Work submits schema-valid JSON
→ app persists candidates
```

No Instagram integration is required.

## 0.1 Minimal application

Create a Next.js App Router application with:

```text
/work/[jobId]
/api/work/session
/api/work/job/[jobId]
/api/work/result
/dev/phase-0
```

The Work page is intentionally isolated from normal app navigation and third-party scripts.

## 0.2 Durable storage requirement

Local unit tests may use an in-memory store.

A deployed Phase 0 acceptance test **must use durable storage**. A Vercel/serverless memory store cannot count as a passing test because separate requests may execute on different instances.

Initial durable implementation: Supabase/Postgres using only the Phase 0 subset of the final schema.

Minimum persisted records:

- synthetic capture;
- evidence artifacts;
- AI job + attempt;
- Work secret hash + expiry;
- immutable raw result;
- normalized candidates;
- audit events.

## 0.3 Synthetic fixture

Create deterministic evidence containing:

- caption naming Place A;
- transcript naming Place B;
- frame displaying a website;
- one ambiguous venue requiring verification;
- one explicit prompt-injection string.

The malicious string must remain visible as ordinary evidence and must never be copied into trusted task instructions.

## 0.4 Work secret and session

Generate a 256-bit secret from a CSPRNG.

Persist only:

```text
SHA-256(secret)
job ID
attempt
expiry
status
```

The job URL is:

```text
https://<origin>/work/<job-id>#<secret>
```

The fragment is exchanged client-side through `/api/work/session`, then removed with `history.replaceState`.

A successful exchange creates a short-lived, signed, job-scoped `HttpOnly; Secure; SameSite=Strict` session cookie.

The session may only:

- read evidence for the exact job/attempt;
- submit one candidate result for the exact job/attempt.

It may never:

- access another capture;
- list the user's library;
- create or merge canonical entities;
- mutate capture ownership;
- obtain service-role credentials.

Every result submission re-checks the current job attempt in durable storage. A previously issued cookie is not sufficient if the attempt has been revoked or superseded.

## 0.5 CSRF and origin controls

Result submission must require all of:

- valid scoped session;
- exact expected `Origin` when present;
- same-origin request;
- JSON content type;
- CSRF token bound to the scoped session;
- job ID + attempt matching the session and body.

Do not rely on SameSite cookies as the only CSRF control.

## 0.6 Result validation and idempotency

Use `contracts/work-result.schema.json` as the canonical contract.

Submission pipeline:

```text
authenticate scoped session
→ verify active job + attempt
→ verify CSRF/origin
→ enforce request byte limit
→ parse JSON
→ validate JSON Schema
→ canonicalize/hash payload bytes
→ check existing result
→ persist immutable raw result
→ normalize candidates
→ transition to CANDIDATES_READY
→ audit
→ revoke write capability for attempt
```

Rules:

- identical replay after successful submission returns success idempotently;
- different second result for the same attempt returns conflict and is audited;
- an expired/revoked/superseded attempt cannot submit;
- malformed results never partially create candidates;
- candidates and raw result commit in one transaction where practical.

## 0.7 Gmail + Work

Use the task in `WORK_SETUP.md`.

The trigger contains only:

```text
SCHEMA
JOB_ID
ATTEMPT
JOB_URL
```

No caption, transcript, OCR, frame text, or user-authored instructions are included in the trigger message.

## Phase 0 acceptance gate

- [ ] new Gmail message reliably starts the configured Work task;
- [ ] Work opens only the configured application origin;
- [ ] fragment secret exchange succeeds;
- [ ] secret is absent from normal HTTP request URLs/logs;
- [ ] Work reads caption, transcript and frame evidence;
- [ ] embedded prompt injection is treated as untrusted data;
- [ ] ambiguous venue is handled conservatively;
- [ ] result validates against the JSON Schema;
- [ ] durable raw result and candidates are persisted;
- [ ] identical replay is idempotent;
- [ ] conflicting replay is rejected;
- [ ] expired attempt cannot submit;
- [ ] new attempt revokes old attempt capability;
- [ ] no canonical entity is created;
- [ ] normal callback path does not repeatedly require manual approval.

### Decision gate

If Work analysis succeeds but unattended browser writeback is unavailable or repeatedly pauses for approval:

```text
Work analysis
→ exact JSON in Work result
→ Import Work JSON in app
→ candidates
→ normal human confirmation
```

This is an accepted V1 fallback. Do not add a metered LLM API merely to bridge the callback.

---

# Phase 1 — App foundation and data integrity

## Goal

Build the durable domain model before media acquisition.

## 1.1 Application

Next.js App Router, mobile-first PWA:

- Inbox;
- capture detail;
- candidate review;
- Library;
- isolated Work job route;
- Share Target route.

## 1.2 Supabase

Create explicit migrations for:

```text
captures
capture_artifacts
ai_jobs
ai_raw_results
candidates
entities
entity_sources
audit_events
```

Add explicit constraints, foreign keys, indexes and RLS. Do not make lifecycle-critical fields depend solely on JSON blobs.

Recommended indexes:

```text
captures(owner_id, source_fingerprint)
captures(owner_id, status)
capture_artifacts(capture_id)
capture_artifacts(expires_at)
ai_jobs(capture_id, attempt)
candidates(capture_id)
entities(owner_id, kind)
entity_sources(capture_id)
audit_events(capture_id, created_at)
```

## 1.3 Authentication

V1:

- Google sign-in through Supabase Auth;
- server-side owner allowlist;
- no public registration;
- RLS on all owner-visible tables.

Service-role credentials remain server-only.

## 1.4 State machine

All capture transitions go through one server-side domain service.

No page or generic CRUD endpoint may write arbitrary statuses.

A transition and its audit event should be committed atomically.

## 1.5 Confirmation boundary

Canonical entity creation happens only through a dedicated confirmation transaction:

```text
validate review revision
→ validate selected candidates
→ resolve explicit merge choices
→ create/update/link entities
→ create entity_sources
→ update candidate review state
→ transition capture
→ append audit event
```

Candidate creation and entity confirmation are separate capabilities.

## Phase 1 acceptance gate

- [ ] unauthenticated users cannot read/write owner data;
- [ ] RLS prevents cross-owner access;
- [ ] duplicate source fingerprint cannot create a parallel capture for the same owner;
- [ ] invalid state transitions fail closed;
- [ ] candidate records cannot create entities without confirmation;
- [ ] stale review revision cannot overwrite a newer review;
- [ ] audit history reconstructs the capture lifecycle.

---

# Phase 2 — Android Share Target

## Goal

One Instagram Share should create or foreground a capture.

## Build

Manifest accepts POSTed:

```text
title
text
url
```

Server pipeline:

```text
receive share
→ extract all HTTP(S) URL candidates
→ validate supported source
→ canonicalize Reel URL
→ fingerprint
→ find/create capture
→ queue acquisition
→ redirect to capture
```

Fingerprint:

```text
SHA-256(platform + canonical_url)
```

Instagram may place the URL inside `text`; test that path explicitly.

## URL safety

Do not perform arbitrary server-side fetches merely to parse the share.

If redirect resolution is required later:

- allow only HTTP(S);
- bound redirect count;
- validate each hop;
- reject loopback, link-local, RFC1918/private, metadata-service and disallowed IP ranges;
- require the final host to match a configured source adapter.

## Duplicate semantics

- active capture → foreground existing capture;
- confirmed capture → show saved items + optional explicit reprocess;
- failed capture → new processing attempt under same capture;
- never create duplicate canonical entities silently.

## Phase 2 acceptance gate

- [ ] installed PWA appears in Android Share sheet;
- [ ] URL-in-text shares work;
- [ ] commentary + URL works;
- [ ] duplicate share returns existing capture;
- [ ] unsupported source fails visibly;
- [ ] parser performs no arbitrary URL fetch.

---

# Phase 3 — Worker protocol

## Goal

Create an outbound-only worker with narrowly scoped cloud access.

## Backend protocol

```text
POST /api/worker/claim
POST /api/worker/:captureId/heartbeat
POST /api/worker/:captureId/artifacts
POST /api/worker/:captureId/complete
POST /api/worker/:captureId/fail
```

Worker authentication:

- high-entropy dedicated secret;
- HTTPS only;
- independently rotatable;
- rate limited.

The worker receives only:

- capture ID;
- canonical source URL;
- acquisition attempt;
- configured resource limits;
- short-lived per-job upload grants.

It never receives:

- Supabase service-role key;
- user session;
- Work callback secret;
- unrelated capture data.

## Leasing

A claim creates a bounded lease.

If the worker dies, a stale lease becomes reclaimable without creating a second concurrent active attempt.

All completion/failure calls are idempotent.

## Container constraints

- non-root;
- no privileged mode;
- no Docker socket;
- explicit CPU/memory/PID/temp-disk limits;
- process timeouts;
- narrow filesystem mounts;
- network only as required.

## Phase 3 acceptance gate

- [ ] cloud cannot initiate an inbound connection to worker;
- [ ] worker cannot query owner/library data;
- [ ] two workers cannot concurrently own one acquisition attempt;
- [ ] stale lease recovers safely;
- [ ] duplicate completion is harmless;
- [ ] worker secret alone cannot enumerate captures.

---

# Phase 4 — Instagram acquisition spike

## Goal

Measure actual acquisition reliability before treating it as solved.

## Adapter

```ts
interface AcquisitionAdapter {
  canHandle(sourceUrl: URL): boolean
  acquire(
    sourceUrl: URL,
    context: AcquisitionContext
  ): Promise<AcquisitionResult>
}
```

The first adapter may use yt-dlp-compatible extraction. No upstream domain model may depend on yt-dlp-specific output.

## Corpus

Use 20–30 Reels the user can legitimately access, covering:

- public Reel;
- location in caption;
- location spoken only;
- location visible only;
- several locations;
- website shown on screen;
- non-English speech;
- music-heavy Reel;
- Reel with no useful location;
- unavailable download;
- authenticated-session case where appropriate.

Record structured failure classes:

```text
UNSUPPORTED_URL
AUTH_REQUIRED
MEDIA_UNAVAILABLE
RATE_LIMITED
NETWORK_ERROR
TOO_LARGE
TOO_LONG
INVALID_MEDIA
EXTRACTOR_ERROR
UNKNOWN
```

Do not surface raw downloader stack traces to users.

## Manual fallback

```text
Could not retrieve this Reel automatically.

[Upload video]
[Retry]
[Keep as URL only]
```

The capture remains durable.

## Phase 4 decision gate

Do not invent a target success percentage before measurement.

Record:

- automatic acquisition rate;
- failure distribution;
- effect of authenticated cookies;
- average media size;
- processing duration;
- recurrent breakage modes.

Proceed only after deciding whether the adapter is usable enough for daily capture and documenting the fallback for failures.

---

# Phase 5 — Evidence preparation

## Goal

Create bounded evidence useful to Work without sending the full video.

## Validation

Use `ffprobe` before decode.

Initial hard limits:

- max input: 100 MB;
- max duration: 5 minutes;
- max retained frames: 16;
- max frame width: 1600 px;
- max transcript submitted to Work: 30,000 characters.

Reject invalid or over-limit media before expensive processing.

## Frames

Start with:

1. first meaningful/poster frame;
2. scene-change candidates;
3. high-information candidates when cheaply detectable;
4. evenly spaced fallback frames.

Store timestamp + SHA-256 + byte size + MIME type.

OCR is not a V1 hard dependency.

## Audio

```text
video
→ mono speech-oriented audio
→ whisper.cpp
→ timestamped transcript
```

Represent unavailable caption/transcript explicitly rather than as an empty successful artifact.

## Phase 5 acceptance gate

- [ ] important visible venue names appear in retained frames often enough to be useful;
- [ ] spoken venue names survive transcription often enough to be useful;
- [ ] evidence page remains bounded and responsive;
- [ ] normal Work path does not require raw video;
- [ ] partial worker failure cannot mark evidence complete.

---

# Phase 6 — Production Work trigger

## Goal

Wake Work automatically after evidence becomes ready.

## Job creation

```text
EVIDENCE_READY
→ create ai_job attempt
→ create 256-bit Work secret
→ store secret hash + expiry
→ AI_TRIGGER_QUEUED
→ dispatch Gmail envelope
→ AI_TRIGGER_SENT
```

Implement the mailer interface in `WORK_SETUP.md`.

Initial zero-incremental-cost adapter: Google Apps Script.

Authenticate backend → Apps Script requests with:

- timestamp;
- body hash;
- HMAC;
- short freshness window.

The script uses a fixed recipient, fixed subject prefix and fixed body template. The caller cannot select arbitrary recipients or free-form content.

Record the trigger idempotency key before dispatch.

Do not create a new AI attempt simply because a mail-send response was lost.

## Phase 6 acceptance gate

- [ ] duplicate dispatch calls cannot produce multiple active attempts;
- [ ] trigger contains no evidence content;
- [ ] stalled Work job is detectable by timeout state;
- [ ] retry rotates secret and supersedes prior attempt;
- [ ] manual JSON import remains available.

---

# Phase 7 — Candidate review and confirmation

## Goal

Make review faster than re-watching the Reel.

Candidate card:

- selected state;
- kind;
- name;
- address/domain;
- verification status;
- confidence;
- strongest evidence;
- duplicate suggestion;
- Edit.

Actions:

- Confirm selected;
- Reject;
- Edit;
- Add missing;
- Merge with existing.

Evidence drill-down shows caption excerpt, transcript timestamp, frame and verification source.

Never auto-merge places based only on fuzzy name similarity.

## Phase 7 acceptance gate

- [ ] wrong branch/address can be corrected before save;
- [ ] each candidate can be independently rejected;
- [ ] missing candidate can be manually added;
- [ ] duplicate suggestion never silently merges;
- [ ] confirmation retains source-Reel provenance;
- [ ] stale review revision fails safely.

---

# Phase 8 — Library and retention

## V1 Library

Only:

- search;
- place/website filter;
- entity detail;
- source Reels;
- delete.

Defer tags, collections, maps, itineraries and recommendations.

## Retention

Default:

| Artifact | Retention |
|---|---:|
| source video/audio | 24h after candidates ready |
| frames/transcript | 7d after confirmation |
| failed-job media | 7d unless retry pending |
| immutable Work result | retained for audit |
| confirmed entity + provenance | until user deletes |

Cleanup pipeline:

```text
find expired metadata
→ delete storage object
→ verify deletion result
→ mark deleted
→ audit
→ retry failures
```

Never mark an object deleted before storage deletion succeeds or is positively known already absent.

---

# Phase 9 — Hardening and operational readiness

## Security tests

Automate:

- RLS isolation;
- cross-job Work session access;
- cross-capture artifact access;
- expired/revoked Work secrets;
- stale attempt submission;
- CSRF failure;
- origin mismatch;
- prompt-injection fixtures;
- XSS evidence payloads;
- SSRF including redirect-to-private-IP;
- oversized result payloads;
- file-size/duration bombs;
- secret scanning.

## Reliability tests

Exercise:

- phone closes immediately after share;
- same Reel shared twice concurrently;
- worker offline for a day;
- worker crash mid-download;
- Gmail trigger delayed;
- Work opens old attempt after retry;
- malformed Work JSON;
- empty candidates;
- Work submits twice;
- retention runs while retry is pending.

## Recovery invariant

Every nonterminal state must have at least one of:

- automatic retry;
- visible Retry;
- Manual upload;
- Import Work JSON;
- Cancel.

There must be no state whose only recovery is direct database editing.

---

# Repository structure

```text
reel-extract/
├─ app/
│  ├─ (app)/
│  │  ├─ inbox/
│  │  ├─ captures/[id]/
│  │  └─ library/
│  ├─ share/
│  ├─ work/[jobId]/
│  └─ api/
│     ├─ captures/
│     ├─ worker/
│     └─ work/
├─ components/
├─ lib/
│  ├─ auth/
│  ├─ captures/
│  ├─ contracts/
│  ├─ db/
│  ├─ security/
│  ├─ storage/
│  └─ work/
├─ contracts/
├─ supabase/
│  └─ migrations/
├─ worker/
│  ├─ Dockerfile
│  ├─ acquisition/
│  ├─ media/
│  └─ transcription/
├─ apps-script/
│  └─ trigger-mailer/
├─ docs/
└─ tests/
```

Keep web app and worker in one repository initially while preserving a strict protocol boundary.

---

# First implementation slice

The first implementation commit after this plan is Phase 0 infrastructure only:

```text
chore: scaffold Next.js application
feat: add Work result contract validation
feat: add synthetic Phase 0 fixture
feat: add Work secret hashing
feat: add signed job-scoped Work session
feat: add CSRF-bound result submission
feat: add isolated Work evidence page
feat: add idempotent result semantics
feat: add Supabase Phase 0 persistence adapter/migration
test: add schema/session/idempotency tests
docs: add Phase 0 local/deployed setup
```

Do not add Instagram acquisition or worker code to this slice.

The question this slice must answer is:

> Can ChatGPT Work safely and reliably serve as the AI execution layer without a metered LLM API?

---

# Definition of V1 done

V1 is complete when:

1. Reel Extract appears in the Android Share sheet.
2. Sharing a Reel creates or retrieves the correct capture.
3. Capture persists after the browser closes.
4. Local worker picks it up without inbound home-network access.
5. Evidence is prepared locally and bounded.
6. Gmail triggers Work without an LLM API call.
7. Work returns structured places/websites or the documented manual JSON fallback works.
8. User can edit/reject/add/merge candidates.
9. Nothing becomes canonical without explicit confirmation.
10. Confirmed entities remain searchable after raw media deletion.
11. Re-sharing the same Reel does not silently duplicate data.
12. Every external failure has a visible recovery action.
13. Temporary media is purged automatically.
14. Routine operation has no metered LLM cost.

---

# Explicitly deferred

Until the V1 capture loop is in regular use, do not build:

- other social platforms;
- maps;
- trip planning;
- recommendation ranking;
- automatic itinerary insertion;
- multi-user collaboration;
- semantic/vector search;
- OCR microservices;
- permanent video archive;
- push notifications;
- elaborate confidence visualizations.

The next engineering action is Phase 0 implementation, not the full application.
