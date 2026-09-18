import { describe, expect, it, vi } from "vitest";
import { SupabaseWorkStore } from "../../lib/work/supabase-store";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

type MockFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

describe("SupabaseWorkStore", () => {
  const url = "https://project.supabase.co";
  const key = "sb_secret_phase0_test_key";

  it("maps a PostgREST job row into the domain record using a modern secret key", async () => {
    const fetchImpl = vi.fn<MockFetch>(async (_input, _init) =>
      jsonResponse([
        {
          id: "11111111-1111-4111-8111-111111111111",
          attempt: 2,
          secret_hash: "a".repeat(64),
          secret_expires_at: "2026-09-19T00:00:00.000Z",
          status: "AI_TRIGGER_SENT",
          result_sha256: null,
          opened_at: null
        }
      ])
    );

    const store = new SupabaseWorkStore({
      url,
      secretKey: key,
      fetchImpl
    });

    const job = await store.getJob("11111111-1111-4111-8111-111111111111");

    expect(job).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      attempt: 2,
      secretHash: "a".repeat(64),
      secretExpiresAt: Date.parse("2026-09-19T00:00:00.000Z"),
      status: "AI_TRIGGER_SENT",
      resultSha256: null,
      openedAt: null
    });

    const [requestUrl, init] = fetchImpl.mock.calls[0]!;
    expect(String(requestUrl)).toContain("/rest/v1/phase0_work_jobs");
    expect(String(requestUrl)).toContain("id=eq.");
    expect(init?.headers).toMatchObject({ apikey: key });
    expect(init?.headers).not.toHaveProperty("authorization");
  });

  it("marks opened only for the exact job attempt", async () => {
    const fetchImpl = vi.fn<MockFetch>(
      async (_input, _init) => new Response(null, { status: 204 })
    );
    const store = new SupabaseWorkStore({ url, secretKey: key, fetchImpl });

    await store.markOpened(
      "11111111-1111-4111-8111-111111111111",
      3,
      Date.parse("2026-09-18T07:30:00.000Z")
    );

    const [requestUrl, init] = fetchImpl.mock.calls[0]!;
    expect(String(requestUrl)).toContain("attempt=eq.3");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      opened_at: "2026-09-18T07:30:00.000Z",
      status: "AI_OPENED"
    });
  });

  it.each(["accept", "replay", "conflict"] as const)(
    "maps atomic RPC disposition %s",
    async (disposition) => {
      const fetchImpl = vi.fn<MockFetch>(async (_input, _init) =>
        jsonResponse(disposition)
      );
      const store = new SupabaseWorkStore({ url, secretKey: key, fetchImpl });

      const result = await store.commitResult({
        jobId: "11111111-1111-4111-8111-111111111111",
        attempt: 1,
        sha256: "b".repeat(64),
        payload: { ok: true }
      });

      expect(result).toBe(disposition);
      const [requestUrl, init] = fetchImpl.mock.calls[0]!;
      expect(String(requestUrl)).toBe(
        "https://project.supabase.co/rest/v1/rpc/phase0_commit_work_result"
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        p_job_id: "11111111-1111-4111-8111-111111111111",
        p_attempt: 1,
        p_sha256: "b".repeat(64),
        p_payload: { ok: true }
      });
    }
  );

  it("fails closed on a non-success response or unexpected RPC value", async () => {
    const failing = new SupabaseWorkStore({
      url,
      secretKey: key,
      fetchImpl: async (_input, _init) => jsonResponse({ message: "nope" }, 500)
    });

    await expect(failing.getJob("x")).rejects.toThrow(/Supabase WorkStore/);

    const unexpected = new SupabaseWorkStore({
      url,
      secretKey: key,
      fetchImpl: async (_input, _init) => jsonResponse("wat")
    });

    await expect(
      unexpected.commitResult({
        jobId: "11111111-1111-4111-8111-111111111111",
        attempt: 1,
        sha256: "b".repeat(64),
        payload: {}
      })
    ).rejects.toThrow(/unexpected disposition/i);
  });
});
