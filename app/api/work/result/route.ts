import { NextRequest, NextResponse } from "next/server";
import { workApiError } from "../../../../lib/work/api-error";
import {
  WORK_CSRF_HEADER,
  WORK_RESULT_MAX_BYTES,
  WORK_SESSION_COOKIE
} from "../../../../lib/work/constants";
import { readBoundedJson } from "../../../../lib/work/http";
import {
  getExpectedOrigin,
  getWorkSigningKey,
  getWorkStore
} from "../../../../lib/work/runtime";
import { submitWorkResult } from "../../../../lib/work/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(WORK_SESSION_COOKIE)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "WORK_SESSION_REQUIRED" }, { status: 401 });
    }

    const csrfToken = request.headers.get(WORK_CSRF_HEADER);
    if (!csrfToken) {
      return NextResponse.json({ error: "CSRF_REQUIRED" }, { status: 403 });
    }

    const body = await readBoundedJson(request, WORK_RESULT_MAX_BYTES);
    const result = await submitWorkResult({
      store: getWorkStore(),
      sessionToken,
      csrfToken,
      origin: request.headers.get("origin"),
      expectedOrigin: getExpectedOrigin(request.url),
      signingKey: getWorkSigningKey(),
      body
    });

    return NextResponse.json({
      ok: true,
      disposition: result.disposition,
      sha256: result.sha256
    });
  } catch (error) {
    return workApiError(error);
  }
}
