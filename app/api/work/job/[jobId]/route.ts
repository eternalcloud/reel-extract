import { NextRequest, NextResponse } from "next/server";
import { WORK_SESSION_COOKIE } from "../../../../../lib/work/constants";
import { getPhase0Evidence } from "../../../../../lib/work/phase0-fixture";
import {
  getWorkSigningKey,
  getWorkStore
} from "../../../../../lib/work/runtime";
import { verifyWorkSession } from "../../../../../lib/work/security";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;
  const token = request.cookies.get(WORK_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "WORK_SESSION_REQUIRED" }, { status: 401 });
  }

  const claims = verifyWorkSession(token, getWorkSigningKey());
  if (!claims) {
    return NextResponse.json({ error: "WORK_SESSION_INVALID" }, { status: 401 });
  }

  if (claims.jobId !== jobId) {
    return NextResponse.json({ error: "JOB_SCOPE_REJECTED" }, { status: 403 });
  }

  const job = await getWorkStore().getJob(jobId);
  if (!job || job.attempt !== claims.attempt) {
    return NextResponse.json({ error: "JOB_ATTEMPT_MISMATCH" }, { status: 409 });
  }

  const evidence = getPhase0Evidence(jobId);
  if (!evidence) {
    return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    job_id: job.id,
    attempt: job.attempt,
    status: job.status,
    evidence
  });
}
