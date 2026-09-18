import { describe, expect, it } from "vitest";
import { MemoryWorkStore } from "../../lib/work/memory-store";
import { hashWorkSecret } from "../../lib/work/security";
import type { WorkJobRecord } from "../../lib/work/store";

function job(overrides: Partial<WorkJobRecord> = {}): WorkJobRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    attempt: 1,
    secretHash: hashWorkSecret("secret"),
    secretExpiresAt: 2_000_000,
    status: "AI_TRIGGER_SENT",
    resultSha256: null,
    openedAt: null,
    ...overrides
  };
}

describe("MemoryWorkStore", () => {
  it("returns job snapshots rather than mutable internal records", async () => {
    const store = new MemoryWorkStore([job()]);
    const first = await store.getJob("11111111-1111-4111-8111-111111111111");
    expect(first).not.toBeNull();
    first!.status = "MUTATED";

    const second = await store.getJob("11111111-1111-4111-8111-111111111111");
    expect(second?.status).toBe("AI_TRIGGER_SENT");
  });

  it("marks opened only for the active attempt", async () => {
    const store = new MemoryWorkStore([job()]);

    await store.markOpened("11111111-1111-4111-8111-111111111111", 2, 100);
    expect((await store.getJob("11111111-1111-4111-8111-111111111111"))?.openedAt).toBeNull();

    await store.markOpened("11111111-1111-4111-8111-111111111111", 1, 200);
    const opened = await store.getJob("11111111-1111-4111-8111-111111111111");
    expect(opened?.openedAt).toBe(200);
    expect(opened?.status).toBe("AI_OPENED");
  });

  it("atomically classifies identical and conflicting result commits", async () => {
    const store = new MemoryWorkStore([job()]);
    const input = {
      jobId: "11111111-1111-4111-8111-111111111111",
      attempt: 1,
      sha256: "aaa",
      payload: { ok: true }
    };

    const [a, b] = await Promise.all([
      store.commitResult(input),
      store.commitResult(input)
    ]);

    expect([a, b].sort()).toEqual(["accept", "replay"]);
    expect(
      await store.commitResult({ ...input, sha256: "bbb", payload: { ok: false } })
    ).toBe("conflict");

    const updated = await store.getJob(input.jobId);
    expect(updated?.status).toBe("CANDIDATES_READY");
    expect(updated?.resultSha256).toBe("aaa");
  });

  it("rejects commits for stale attempts", async () => {
    const store = new MemoryWorkStore([job({ attempt: 2 })]);

    await expect(
      store.commitResult({
        jobId: "11111111-1111-4111-8111-111111111111",
        attempt: 1,
        sha256: "aaa",
        payload: {}
      })
    ).rejects.toThrow("stale work attempt");
  });
});
