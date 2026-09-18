import type {
  PersistWorkResultInput,
  WorkJobRecord,
  WorkStore
} from "./store";
import type { SubmissionDisposition } from "./idempotency";

export class MemoryWorkStore implements WorkStore {
  constructor(_jobs: WorkJobRecord[] = []) {}

  async getJob(_jobId: string): Promise<WorkJobRecord | null> {
    return null;
  }

  async markOpened(_jobId: string, _attempt: number, _openedAt: number): Promise<void> {
    throw new Error("not implemented");
  }

  async commitResult(_input: PersistWorkResultInput): Promise<SubmissionDisposition> {
    throw new Error("not implemented");
  }
}
