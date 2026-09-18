import type { WorkStore } from "./store";

export class WorkRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
  }
}

export async function exchangeWorkSecret(_input: {
  store: WorkStore;
  jobId: string;
  secret: string;
  signingKey: string;
  nowMs?: number;
}): Promise<{ sessionToken: string; csrfToken: string; attempt: number }> {
  throw new WorkRequestError("NOT_IMPLEMENTED", 501);
}

export async function submitWorkResult(_input: {
  store: WorkStore;
  sessionToken: string;
  csrfToken: string;
  origin: string | null;
  expectedOrigin: string;
  signingKey: string;
  body: unknown;
  nowMs?: number;
}): Promise<{ disposition: "accepted" | "replay"; sha256: string }> {
  throw new WorkRequestError("NOT_IMPLEMENTED", 501);
}
