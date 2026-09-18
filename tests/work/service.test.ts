import { describe, expect, it } from "vitest";
import { hashWorkSecret } from "../../lib/work/security";
import {
  exchangeWorkSecret,
  submitWorkResult,
  WorkRequestError
} from "../../lib/work/service";
import type {
  PersistWorkResultInput,
  WorkJobRecord,
  WorkStore
} from "../../lib/work/store";
import { validWorkResult } from "../fixtures/work-result";

class FakeStore implements WorkStore {
  job: WorkJobRecord;
  persisted: PersistWorkResultInput[] = [];

  constructor(job?: Partial<WorkJobRecord>) {
    this.job = {
      id: "11111111-1111-4111-8111-111111111111",
      attempt: 1,
      secretHash: hashWorkSecret("correct-secret"),
      secretExpiresAt: 2_000_000,
      status: "AI_TRIGGER_SENT",
      resultSha256: null,
      openedAt: null,
      ...job
    };
  }

  async getJob(jobId: string) {
    return jobId === this.job.id ? this.job : null;
  }

  async markOpened(jobId: string, attempt: number, openedAt: number) {
    if (jobId === this.job.id && attempt === this.job.attempt) {
      this.job.openedAt = openedAt;
      this.job.status = "AI_OPENED";
    }
  }

  async getResultSha256(jobId: string, attempt: number) {
    return jobId === this.job.id && attempt === this.job.attempt
      ? this.job.resultSha256
      : null;
  }

  async persistResult(input: PersistWorkResultInput) {
    this.persisted.push(input);
    this.job.resultSha256 = input.sha256;
    this.job.status = "CANDIDATES_READY";
  }
}

const signingKey = "phase-0-signing-key-with-more-than-32-chars";

async function expectWorkError(
  promise: Promise<unknown>,
  code: string,
  status: number
) {
  try {
    await promise;
    throw new Error("expected WorkRequestError");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkRequestError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("exchangeWorkSecret", () => {
  it("exchanges the correct fragment secret and marks the job opened", async () => {
    const store = new FakeStore();

    const result = await exchangeWorkSecret({
      store,
      jobId: store.job.id,
      secret: "correct-secret",
      signingKey,
      nowMs: 1_000_000
    });

    expect(result.attempt).toBe(1);
    expect(result.sessionToken).not.toContain("correct-secret");
    expect(result.csrfToken.length).toBeGreaterThan(20);
    expect(store.job.status).toBe("AI_OPENED");
    expect(store.job.openedAt).toBe(1_000_000);
  });

  it("rejects a wrong or expired fragment secret", async () => {
    const store = new FakeStore();

    await expectWorkError(
      exchangeWorkSecret({
        store,
        jobId: store.job.id,
        secret: "wrong",
        signingKey,
        nowMs: 1_000_000
      }),
      "INVALID_WORK_SECRET",
      401
    );

    store.job.secretExpiresAt = 900_000;
    await expectWorkError(
      exchangeWorkSecret({
        store,
        jobId: store.job.id,
        secret: "correct-secret",
        signingKey,
        nowMs: 1_000_000
      }),
      "WORK_SECRET_EXPIRED",
      410
    );
  });
});

describe("submitWorkResult", () => {
  async function openedSession(store: FakeStore) {
    return exchangeWorkSecret({
      store,
      jobId: store.job.id,
      secret: "correct-secret",
      signingKey,
      nowMs: 1_000_000
    });
  }

  it("accepts and persists a valid first result", async () => {
    const store = new FakeStore();
    const session = await openedSession(store);

    const result = await submitWorkResult({
      store,
      sessionToken: session.sessionToken,
      csrfToken: session.csrfToken,
      origin: "https://reel.example.com",
      expectedOrigin: "https://reel.example.com",
      signingKey,
      body: validWorkResult,
      nowMs: 1_000_100
    });

    expect(result.disposition).toBe("accepted");
    expect(store.persisted).toHaveLength(1);
    expect(store.persisted[0].attempt).toBe(1);
  });

  it("treats the same semantic result as a replay and rejects a conflicting second result", async () => {
    const store = new FakeStore();
    const session = await openedSession(store);

    const first = await submitWorkResult({
      store,
      sessionToken: session.sessionToken,
      csrfToken: session.csrfToken,
      origin: "https://reel.example.com",
      expectedOrigin: "https://reel.example.com",
      signingKey,
      body: validWorkResult,
      nowMs: 1_000_100
    });

    const reordered = {
      warnings: validWorkResult.warnings,
      candidates: validWorkResult.candidates,
      attempt: validWorkResult.attempt,
      job_id: validWorkResult.job_id,
      schema_version: validWorkResult.schema_version
    };

    const replay = await submitWorkResult({
      store,
      sessionToken: session.sessionToken,
      csrfToken: session.csrfToken,
      origin: "https://reel.example.com",
      expectedOrigin: "https://reel.example.com",
      signingKey,
      body: reordered,
      nowMs: 1_000_200
    });

    expect(replay).toEqual({ disposition: "replay", sha256: first.sha256 });
    expect(store.persisted).toHaveLength(1);

    const conflict = structuredClone(validWorkResult) as any;
    conflict.warnings = ["different"];

    await expectWorkError(
      submitWorkResult({
        store,
        sessionToken: session.sessionToken,
        csrfToken: session.csrfToken,
        origin: "https://reel.example.com",
        expectedOrigin: "https://reel.example.com",
        signingKey,
        body: conflict,
        nowMs: 1_000_300
      }),
      "WORK_RESULT_CONFLICT",
      409
    );
  });

  it("rejects bad origin, CSRF, schema, and mismatched job/attempt", async () => {
    const store = new FakeStore();
    const session = await openedSession(store);

    await expectWorkError(
      submitWorkResult({
        store,
        sessionToken: session.sessionToken,
        csrfToken: session.csrfToken,
        origin: "https://evil.example.com",
        expectedOrigin: "https://reel.example.com",
        signingKey,
        body: validWorkResult,
        nowMs: 1_000_100
      }),
      "ORIGIN_REJECTED",
      403
    );

    await expectWorkError(
      submitWorkResult({
        store,
        sessionToken: session.sessionToken,
        csrfToken: "wrong",
        origin: "https://reel.example.com",
        expectedOrigin: "https://reel.example.com",
        signingKey,
        body: validWorkResult,
        nowMs: 1_000_100
      }),
      "CSRF_REJECTED",
      403
    );

    await expectWorkError(
      submitWorkResult({
        store,
        sessionToken: session.sessionToken,
        csrfToken: session.csrfToken,
        origin: "https://reel.example.com",
        expectedOrigin: "https://reel.example.com",
        signingKey,
        body: { nope: true },
        nowMs: 1_000_100
      }),
      "INVALID_WORK_RESULT",
      400
    );

    const mismatch = { ...validWorkResult, attempt: 2 };
    await expectWorkError(
      submitWorkResult({
        store,
        sessionToken: session.sessionToken,
        csrfToken: session.csrfToken,
        origin: "https://reel.example.com",
        expectedOrigin: "https://reel.example.com",
        signingKey,
        body: mismatch,
        nowMs: 1_000_100
      }),
      "JOB_ATTEMPT_MISMATCH",
      409
    );
  });
});
