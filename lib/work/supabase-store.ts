import type {
  PersistWorkResultInput,
  WorkJobRecord,
  WorkStore
} from "./store";
import type { SubmissionDisposition } from "./idempotency";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export class SupabaseWorkStore implements WorkStore {
  constructor(
    _config: {
      url: string;
      serviceRoleKey: string;
      fetchImpl?: FetchLike;
    }
  ) {}

  async getJob(_jobId: string): Promise<WorkJobRecord | null> {
    throw new Error("not implemented");
  }

  async markOpened(
    _jobId: string,
    _attempt: number,
    _openedAt: number
  ): Promise<void> {
    throw new Error("not implemented");
  }

  async commitResult(
    _input: PersistWorkResultInput
  ): Promise<SubmissionDisposition> {
    throw new Error("not implemented");
  }
}
