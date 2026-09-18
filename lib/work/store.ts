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
  getResultSha256(jobId: string, attempt: number): Promise<string | null>;
  persistResult(input: PersistWorkResultInput): Promise<void>;
}
