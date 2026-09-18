import type {
  PersistWorkResultInput,
  WorkJobRecord,
  WorkStore
} from "./store";
import type { SubmissionDisposition } from "./idempotency";

type StoredResult = PersistWorkResultInput;

function cloneJob(job: WorkJobRecord): WorkJobRecord {
  return structuredClone(job);
}

export class MemoryWorkStore implements WorkStore {
  private readonly jobs = new Map<string, WorkJobRecord>();
  private readonly results = new Map<string, StoredResult>();

  constructor(jobs: WorkJobRecord[] = []) {
    for (const job of jobs) {
      this.jobs.set(job.id, cloneJob(job));
    }
  }

  async getJob(jobId: string): Promise<WorkJobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? cloneJob(job) : null;
  }

  async markOpened(jobId: string, attempt: number, openedAt: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.attempt !== attempt) {
      return;
    }

    job.openedAt = openedAt;
    if (job.status !== "CANDIDATES_READY") {
      job.status = "AI_OPENED";
    }
  }

  async commitResult(input: PersistWorkResultInput): Promise<SubmissionDisposition> {
    const job = this.jobs.get(input.jobId);
    if (!job || job.attempt !== input.attempt) {
      throw new Error("stale work attempt");
    }

    const key = `${input.jobId}:${input.attempt}`;
    const existing = this.results.get(key);

    if (existing) {
      return existing.sha256 === input.sha256 ? "replay" : "conflict";
    }

    // No await occurs before this insertion. Within one Node process this is
    // atomic with respect to competing Promise callers.
    this.results.set(key, structuredClone(input));
    job.resultSha256 = input.sha256;
    job.status = "CANDIDATES_READY";

    return "accept";
  }
}
