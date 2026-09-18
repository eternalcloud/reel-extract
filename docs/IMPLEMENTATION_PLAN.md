# Implementation Plan

## Strategy

Do not build the full application in one pass.

There are two external uncertainties that should be proven before investing in UI polish:

1. **Can ChatGPT Work reliably perform Gmail-triggered analysis and write the result back through the scoped job page?**
2. **How reliably can the chosen local acquisition adapter obtain representative Instagram Reels?**

Everything else is conventional application engineering.

The order below intentionally tests those risks first.

---

# Phase 0 — Prove the Work loop

## Goal

Prove:

```text
Gmail event
  → Work starts
  → Work opens job page
  → Work analyzes supplied synthetic evidence
  → Work submits valid JSON
  → app receives candidates
```

No Instagram integration yet.

## Build

### Minimal app

- one hard-coded authenticated test user;
- one fake capture;
- one fake evidence bundle;
- one `/work/<job-id>#<secret>` page;
- fragment-secret exchange;
- job-scoped session cookie;
- JSON result form;
- server-side JSON Schema validation;
- a simple page showing received result.

### Synthetic evidence

Include:

- caption naming Place A;
- transcript naming Place B;
- image/frame showing `example.com`;
- one intentionally ambiguous venue;
- one explicit prompt injection line.

### Gmail

- connect Gmail to ChatGPT;
- create Work event-triggered task;
- sender + subject filter;
- send fixed machine envelope.

## Pass criteria

- [ ] trigger runs from a new Gmail message;
- [ ] Work ignores the embedded prompt injection;
- [ ] Work opens only the configured app origin;
- [ ] fragment secret is exchanged successfully;
- [ ] callback secret is absent from normal HTTP URL logs;
- [ ] Work submits JSON matching schema;
- [ ] repeat submission is idempotent;
- [ ] conflicting repeat is rejected;
- [ ] expired attempt cannot submit;
- [ ] a new attempt revokes the old one;
- [ ] result creates candidates only;
- [ ] no recurring manual approval is required for the normal writeback path.

## Decision gate

### If all pass

Proceed with automatic Work writeback.

### If analysis works but unattended writeback does not

Proceed with:

```text
Work analysis
→ exact JSON in task output
→ app "Import Work JSON"
→ normal confirmation
```

Keep automatic writeback as a separate enhancement.

Do not introduce a metered LLM API merely to bridge this gap.

---

# Phase 1 — App skeleton and data integrity

## Goal

Build the durable capture/review model before Instagram media acquisition.

## Build

### Next.js PWA

- App Router;
- installable manifest;
- Web Share Target endpoint;
- mobile-first Inbox;
- capture detail;
- review screen;
- saved entities screen.

### Supabase

- Auth;
- Postgres schema;
- RLS;
- temporary Storage bucket;
- migrations;
- seed/dev fixtures.

### Auth

V1:

- Google sign-in;
- server-side owner allowlist;
- no public registration workflow.

### State machine

Implement allowed state transitions as one server-side function/service.

No page directly writes arbitrary statuses.

### Audit events

Every meaningful transition generates an append-only event.

## Tests

- RLS tests;
- state-transition tests;
- duplicate-share tests;
- stale-review revision tests;
- confirmation transaction tests;
- retention metadata tests.

## Pass criteria

- [ ] unauthenticated user cannot read/write data;
- [ ] duplicate share does not create duplicate capture;
- [ ] candidate cannot become entity without confirmation endpoint;
- [ ] stale client cannot overwrite newer review;
- [ ] audit history reconstructs a capture lifecycle.

---

# Phase 2 — Share Target

## Goal

Make capture friction effectively one action after Instagram Share.

## Build

Manifest concept:

```json
{
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

The route:

1. parses all share fields;
2. extracts candidate URLs;
3. validates supported source host;
4. canonicalizes Reel URL;
5. creates/finds capture;
6. redirects to capture status page.

## Edge cases

Test Instagram shares where:

- URL arrives in `text`;
- text contains commentary plus URL;
- several URLs exist;
- URL has tracking params;
- URL is a redirect;
- unsupported Instagram path;
- no URL;
- same Reel already exists.

## Offline behavior

V1 can fail visibly when offline with a retry/copy option.

Do not make Background Sync a launch dependency because browser support/behavior varies.

Later, an IndexedDB outbox can improve offline capture.

## Pass criteria

- [ ] installed PWA appears in Android share sheet;
- [ ] one Instagram Share creates/opens correct capture;
- [ ] unsupported URLs fail safely;
- [ ] no arbitrary server-side URL fetch occurs during parsing.

---

# Phase 3 — Worker protocol

## Goal

Create an outbound-only local worker with no broad cloud credentials.

## Backend endpoints

Conceptually:

```text
POST /api/worker/claim
POST /api/worker/:captureId/heartbeat
POST /api/worker/:captureId/artifacts
POST /api/worker/:captureId/complete
POST /api/worker/:captureId/fail
```

Worker authentication:

- high-entropy `WORKER_SHARED_SECRET`;
- HTTPS only;
- rate-limited;
- independently rotatable.

The worker receives:

- capture ID;
- canonical source URL;
- acquisition attempt;
- short-lived upload grants;
- configured limits.

It does **not** receive:

- service-role key;
- user session;
- Work credentials;
- other captures.

## Worker container

Recommended components:

- Python or Node control process;
- acquisition adapter;
- ffprobe;
- ffmpeg;
- whisper.cpp;
- temporary working directory.

Container constraints:

- non-root;
- no privileged mode;
- no Docker socket;
- CPU/memory/PID limits;
- bounded temp disk;
- network access only as needed;
- explicit process timeouts.

## Heartbeat

Worker reports:

- version;
- current capture ID;
- phase;
- last-seen time.

UI can distinguish:

- queue waiting normally;
- worker offline;
- worker processing;
- worker failed.

## Pass criteria

- [ ] cloud cannot initiate network connection to worker;
- [ ] worker cannot query DB directly;
- [ ] worker secret alone cannot list library data;
- [ ] worker crash leaves capture retryable;
- [ ] duplicate completion call is safe.

---

# Phase 4 — Acquisition spike

## Goal

Measure actual Instagram acquisition reliability before treating it as solved.

## Test corpus

Use 20–30 Reels the user can legitimately access, covering:

- public Reel;
- location in caption;
- location spoken only;
- location visible in signage only;
- several locations;
- website shown on screen;
- non-English speech;
- music-heavy Reel;
- Reel with no useful location;
- Reel whose download is unavailable;
- Reel requiring an authenticated user session, if appropriate.

## Adapter

Initial adapter may use yt-dlp-compatible extraction.

Treat it as replaceable from day one.

Record structured failure classes:

- `UNSUPPORTED_URL`
- `AUTH_REQUIRED`
- `MEDIA_UNAVAILABLE`
- `RATE_LIMITED`
- `NETWORK_ERROR`
- `TOO_LARGE`
- `TOO_LONG`
- `INVALID_MEDIA`
- `EXTRACTOR_ERROR`
- `UNKNOWN`

Do not expose raw downloader stack traces to the user.

## Manual fallback

If acquisition fails:

```text
Could not retrieve this Reel automatically.

[Upload video]
[Retry]
[Keep as URL only]
```

Preserve the capture either way.

## Pass criteria

No target success percentage should be invented before the spike.

Record:

- automatic acquisition rate;
- failure distribution;
- whether authenticated cookies materially improve success;
- average media size;
- processing duration;
- breakage patterns.

Then decide whether the adapter is viable for daily use.

---

# Phase 5 — Evidence preparation

## Goal

Create small, useful evidence without sending a full video into Work.

## Frame extraction

Start with maximum 16 frames.

Algorithm:

1. probe duration;
2. scene-change detection;
3. choose highest-information scene frames;
4. if too few, add evenly spaced frames;
5. resize to max 1600 px width;
6. encode as WebP/JPEG with sensible quality;
7. preserve timestamps.

Do not run OCR as an independent hard dependency initially. Work can inspect the representative frames.

If later testing shows text is routinely missed, add local OCR as another evidence channel.

## Audio

- extract mono speech track;
- local whisper.cpp;
- keep timestamped segments;
- cap submitted transcript length;
- detect/transcribe language automatically initially.

## Caption

Acquisition adapter returns caption/creator where available.

If unavailable, represent it explicitly as unavailable rather than empty-as-success.

## Pass criteria

Against the acquisition corpus:

- [ ] important visible venue names are present in at least one retained frame;
- [ ] spoken venue mentions survive local transcription often enough to be useful;
- [ ] evidence page stays bounded/fast;
- [ ] raw video is not required by Work for the normal path.

---

# Phase 6 — Gmail trigger transport

## Goal

Automatically wake Work when evidence is ready.

## Mail adapter

Implement interface from `WORK_SETUP.md`.

Zero-incremental-cost initial implementation:

- Google Apps Script web endpoint;
- fixed recipient;
- fixed subject prefix;
- HMAC-authenticated request;
- timestamp freshness;
- fixed body template.

The backend records the trigger idempotency key **before** dispatch.

## Idempotency

```text
trigger_idempotency_key =
  "work:" + ai_job_id + ":" + attempt
```

If the backend loses the response after a send attempt, do not blindly create a new AI attempt.

Reconcile/allow the existing attempt to time out first.

## Integration health

Expose:

- last trigger sent;
- last Work job opened;
- recent open/result rate.

If Gmail is disconnected or Work task is paused, the app cannot detect that directly through OpenAI. Infer operational failure only from stalled-job patterns and show a diagnostic checklist, not a false precise diagnosis.

---

# Phase 7 — Candidate review

## Goal

Make human confirmation faster than re-watching the Reel.

## Mobile review UI

Each candidate card:

- checkbox/select state;
- place/website icon;
- name;
- address/domain;
- confidence label;
- verification status;
- top 1–3 evidence snippets;
- duplicate warning;
- Edit.

Actions:

- Confirm selected;
- Reject;
- Add missing;
- Merge into existing.

Avoid showing raw JSON in normal use.

## Evidence drill-down

Tap evidence to view:

- caption excerpt;
- transcript timestamp;
- frame;
- verification URL.

Do not autoplay source video.

## Pass criteria

- [ ] user can fix wrong branch/address before save;
- [ ] candidate can be rejected independently;
- [ ] missing place can be manually added;
- [ ] duplicate suggestion never auto-merges;
- [ ] confirmed entity retains source Reel provenance.

---

# Phase 8 — Retention and cleanup

## Goal

Raw media does not accumulate indefinitely.

## Cleanup

Scheduled backend/DB job:

1. find expired artifacts;
2. delete object storage bytes;
3. mark metadata deleted;
4. audit;
5. retry failures.

Default policy:

- video/audio: 24h after candidates ready;
- frames/transcript: 7d after confirmation;
- failed captures: 7d unless retry pending.

## Pass criteria

- [ ] deletion verified at object-store level;
- [ ] failed deletion remains retryable;
- [ ] cleanup backlog visible;
- [ ] confirmed places/websites remain after source media purge.

---

# Phase 9 — Hardening before regular use

## Security

Run the checklist in `SECURITY.md`.

Especially:

- prompt injection fixture tests;
- SSRF tests including redirect-to-private-IP;
- callback token cross-job tests;
- stale attempt tests;
- XSS payload tests;
- file-size/duration bombs;
- RLS tests;
- secret scanning.

## Reliability

Test:

- phone closes immediately after share;
- same Reel shared twice quickly;
- worker offline for a day;
- worker crashes mid-download;
- Gmail trigger delayed;
- Work opens old attempt after retry;
- Work submits malformed JSON;
- Work produces no candidates;
- Work submits twice;
- retention cleanup runs during retry.

## Recovery UX

Every nonterminal state must have one of:

- automatic retry;
- visible Retry;
- Manual upload;
- Manual Work JSON import;
- Cancel.

There should be no permanent spinner state.

---

# Suggested repository structure

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
│  ├─ security/
│  ├─ storage/
│  └─ work/
├─ contracts/
│  └─ work-result.schema.json
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

Keep worker and web app in one repository initially. The protocol boundary is still explicit, while versioning/deployment remains simpler.

---

# Definition of V1 done

V1 is done when a representative successful flow is:

1. User taps Share on an Instagram Reel.
2. Reel Extract appears in Android share targets.
3. Capture appears immediately in Inbox.
4. Local worker prepares evidence.
5. Gmail triggers Work.
6. Work returns valid candidate places/websites.
7. User receives/observes ready state.
8. User edits/selects and confirms.
9. Confirmed entities appear in Library.
10. Sharing the same Reel again finds the existing capture.
11. Raw media expires automatically.
12. Failure at any external boundary has a visible recovery action.
13. No metered LLM API is required.

---

# What not to build yet

Until V1 is in regular use, avoid:

- collections/tags beyond a minimal future-proof field;
- maps;
- trip planning;
- recommendation ranking;
- automatic itinerary insertion;
- multi-user collaboration;
- semantic search/vector DB;
- OCR microservices;
- multiple social platforms;
- permanent video archive;
- push notifications;
- fancy AI confidence visualization.

The key product question is still:

> Is “Share Reel → review useful structured candidates” reliable enough to become a habit?
