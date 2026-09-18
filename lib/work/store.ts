import type { SubmissionDisposition } from "./idempotency";

export type WorkJobRecord = {
  id: string;
  attempt: number;
  secretHash: string;
  secretExpiresAt: number;
  status: string;
  resultSha256: string | null;
  openedAt: number | null;
};

export type PersistWorkResultInput = {
  jobId: string;
  attempt: number;
  sha256: string;
  payload: unknown;
};

export interface WorkStore {
  getJob(jobId: string): Promise<WorkJobRecord | null>;
  markOpened(jobId: string, attempt: number, openedAt: number): Promise<void>;

  /**
   * Atomically commit or compare a result for one job attempt.
   * Implementations must make concurrent identical submissions resolve as
   * accepted + replay, and differing submissions as accepted + conflict.
   */
  commitResult(input: PersistWorkResultInput): Promise<SubmissionDisposition>;
}
