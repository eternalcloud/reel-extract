import { NextResponse } from "next/server";
import { getWorkStore } from "../../../../../lib/work/runtime";
import { canReuseFixedSeed } from "../../../../../lib/work/phase0-seed-once";

export const runtime = "nodejs";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const FIXED_SECRET_HASH =
  "bd4f027d7459884ee14d7bc9ba05b965db6ba33234de5e77491e4c68758c7fee";

function requiredEnv(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function POST() {
  try {
    const nowMs = Date.now();
    const store = getWorkStore();
    const existing = await store.getJob(JOB_ID);

    if (
      canReuseFixedSeed(
        existing
          ? {
              attempt: existing.attempt,
              secretHash: existing.secretHash,
              secretExpiresAt: existing.secretExpiresAt
            }
          : null,
        FIXED_SECRET_HASH,
        nowMs
      )
    ) {
      return NextResponse.json(
        {
          jobId: JOB_ID,
          attempt: existing!.attempt,
          expiresAt: new Date(existing!.secretExpiresAt).toISOString(),
          disposition: "reused"
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const secretKey = requiredEnv("SUPABASE_SECRET_KEY");
    const expiresAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/phase0_rotate_work_job`,
      {
        method: "POST",
        headers: {
          apikey: secretKey,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          p_job_id: JOB_ID,
          p_secret_hash: FIXED_SECRET_HASH,
          p_expires_at: expiresAt
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.error("Phase 0 seed-once failed", response.status, detail);
      return NextResponse.json(
        { error: "SUPABASE_SEED_FAILED" },
        { status: 502 }
      );
    }

    const attempt = await response.json();
    if (!Number.isInteger(attempt) || attempt < 1) {
      console.error("Phase 0 seed-once returned invalid attempt", attempt);
      return NextResponse.json(
        { error: "INVALID_SEED_RESULT" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        jobId: JOB_ID,
        attempt,
        expiresAt,
        disposition: "seeded"
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    console.error("Phase 0 seed-once failed", error);
    return NextResponse.json({ error: "SEED_FAILED" }, { status: 500 });
  }
}
