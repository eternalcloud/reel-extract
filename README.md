# Reel Extract

A personal capture workflow that turns an Instagram Reel into confirmed, structured places and websites without paying for an LLM API.

## Intended flow

```text
Instagram Share
      ↓
Installed PWA
      ↓
Capture record
      ↓
Local media worker
  ├─ downloads permitted/public media
  ├─ extracts caption/metadata
  ├─ extracts representative frames
  └─ transcribes audio locally
      ↓
Gmail trigger
      ↓
ChatGPT Work
  ├─ reads evidence
  ├─ extracts candidate places/websites
  ├─ verifies ambiguous candidates
  └─ writes candidates back through a scoped callback
      ↓
Confirmation screen
      ↓
Canonical saved entities
```

## Design principles

- **No LLM API dependency.** ChatGPT Work is the reasoning layer through the user's existing subscription.
- **Human confirmation is mandatory.** AI output is always a candidate, never the final stored entity.
- **Instagram acquisition is replaceable.** Downloader failure must not break the rest of the system.
- **Raw media is temporary.** Keep source URLs and confirmed structured data; expire downloaded media by default.
- **No Instagram credentials in the cloud.** If authenticated acquisition is required, cookies stay on the local worker.
- **Evidence is untrusted input.** Captions, speech, frames, URLs, and web pages cannot alter the Work task instructions.
- **Every boundary is idempotent.** Re-sharing, retries, duplicate emails, and duplicate Work submissions must be safe.
- **No silent failures.** Every capture has an observable state and recovery action.

## Proposed stack

| Area | Choice |
|---|---|
| App | Next.js PWA |
| Hosting | Vercel |
| Auth / DB / temporary storage | Supabase |
| Media acquisition | Local Docker worker |
| Media tooling | yt-dlp-compatible acquisition adapter + ffmpeg |
| Speech-to-text | Local whisper.cpp |
| AI reasoning | ChatGPT Work |
| AI trigger | Gmail event-triggered Work task |
| Confirmation | PWA |
| Saved data | Postgres / Supabase |

The local worker is intentionally outbound-only: it polls for work and uploads evidence using job-scoped URLs. No home-network ingress is required.

## Documentation

- [System design](docs/DESIGN.md)
- [Security and threat model](docs/SECURITY.md)
- [ChatGPT Work + Gmail setup](docs/WORK_SETUP.md)
- [Data model and contracts](docs/DATA_MODEL.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Phase 0 runbook](docs/PHASE0.md)
- [Work result JSON Schema](contracts/work-result.schema.json)

## Important product constraint

The official OpenAI documentation confirms that Work supports event-triggered tasks for new Gmail messages and that Work has a cloud browser. It does **not** explicitly promise that every event-triggered task can submit to an arbitrary third-party web form without approval in every account/workspace configuration.

Therefore automatic Work → app writeback is a **Phase 0 acceptance test**. If it is unavailable or requires recurring approval, the app retains a manual JSON import escape hatch and the writeback transport can be swapped without changing the rest of the architecture.

## Scope for V1

V1 intentionally does only this:

1. Receive an Instagram Reel URL through Android share.
2. Build a temporary evidence bundle.
3. Trigger Work.
4. Extract places and websites.
5. Let the user confirm/edit.
6. Save canonical entities and their source Reel.
7. Expire raw media.

No itinerary builder, recommendation engine, social features, or automatic saving without confirmation.

## Status

**Phase 0 implementation is underway.**

The current slice implements the scoped Work job surface, synthetic evidence, schema validation, signed job sessions, CSRF/origin checks, idempotent result handling, durable Supabase persistence, and CI tests/build verification.

The next live gate is the end-to-end Gmail → ChatGPT Work → Reel Extract callback described in [docs/PHASE0.md](docs/PHASE0.md).
