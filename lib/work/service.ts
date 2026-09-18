import { timingSafeEqual } from "node:crypto";
import { sha256CanonicalJson } from "./canonical-json";
import { validateWorkResult } from "./contracts";
import { classifySubmission } from "./idempotency";
import {
  deriveCsrfToken,
  hashWorkSecret,
  isAllowedOrigin,
  issueWorkSession,
  verifyWorkSession
} from "./security";
import type { WorkStore } from "./store";

const SESSION_TTL_MS = 15 * 60 * 1000;

export class WorkRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(code);
    this.name = "WorkRequestError";
  }
}

function safeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function exchangeWorkSecret(input: {
  store: WorkStore;
  jobId: string;
  secret: string;
  signingKey: string;
  nowMs?: number;
}): Promise<{ sessionToken: string; csrfToken: string; attempt: number }> {
  const nowMs = input.nowMs ?? Date.now();
  const job = await input.store.getJob(input.jobId);

  // Do not disclose whether a job ID exists when the secret is wrong/missing.
  if (!job || !safeStringEqual(hashWorkSecret(input.secret), job.secretHash)) {
    throw new WorkRequestError("INVALID_WORK_SECRET", 401);
  }

  if (job.secretExpiresAt < nowMs) {
    throw new WorkRequestError("WORK_SECRET_EXPIRED", 410);
  }

  const expiresAt = Math.min(job.secretExpiresAt, nowMs + SESSION_TTL_MS);
  const sessionToken = issueWorkSession(
    {
      jobId: job.id,
      attempt: job.attempt,
      expiresAt
    },
    input.signingKey
  );

  await input.store.markOpened(job.id, job.attempt, nowMs);

  return {
    sessionToken,
    csrfToken: deriveCsrfToken(sessionToken, input.signingKey),
    attempt: job.attempt
  };
}

export async function submitWorkResult(input: {
  store: WorkStore;
  sessionToken: string;
  csrfToken: string;
  origin: string | null;
  expectedOrigin: string;
  signingKey: string;
  body: unknown;
  nowMs?: number;
}): Promise<{ disposition: "accepted" | "replay"; sha256: string }> {
  const nowMs = input.nowMs ?? Date.now();
  const claims = verifyWorkSession(input.sessionToken, input.signingKey, nowMs);
  if (!claims) {
    throw new WorkRequestError("WORK_SESSION_INVALID", 401);
  }

  if (!isAllowedOrigin(input.origin, input.expectedOrigin)) {
    throw new WorkRequestError("ORIGIN_REJECTED", 403);
  }

  const expectedCsrf = deriveCsrfToken(input.sessionToken, input.signingKey);
  if (!safeStringEqual(input.csrfToken, expectedCsrf)) {
    throw new WorkRequestError("CSRF_REJECTED", 403);
  }

  const validation = validateWorkResult(input.body);
  if (!validation.success) {
    throw new WorkRequestError("INVALID_WORK_RESULT", 400, validation.errors);
  }

  const body = input.body as {
    job_id: string;
    attempt: number;
  };

  if (body.job_id !== claims.jobId || body.attempt !== claims.attempt) {
    throw new WorkRequestError("JOB_ATTEMPT_MISMATCH", 409);
  }

  // A signed cookie is not enough: re-read durable state so superseded attempts fail.
  const job = await input.store.getJob(claims.jobId);
  if (!job || job.attempt !== claims.attempt) {
    throw new WorkRequestError("JOB_ATTEMPT_MISMATCH", 409);
  }

  const sha256 = sha256CanonicalJson(input.body);
  const existing = await input.store.getResultSha256(claims.jobId, claims.attempt);
  const disposition = classifySubmission(existing, sha256);

  if (disposition === "replay") {
    return { disposition: "replay", sha256 };
  }

  if (disposition === "conflict") {
    throw new WorkRequestError("WORK_RESULT_CONFLICT", 409);
  }

  await input.store.persistResult({
    jobId: claims.jobId,
    attempt: claims.attempt,
    sha256,
    payload: input.body
  });

  return { disposition: "accepted", sha256 };
}
