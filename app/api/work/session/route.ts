import { NextRequest, NextResponse } from "next/server";
import { workApiError } from "../../../../lib/work/api-error";
import { WORK_SESSION_COOKIE } from "../../../../lib/work/constants";
import { readBoundedJson } from "../../../../lib/work/http";
import {
  getWorkSigningKey,
  getWorkStore
} from "../../../../lib/work/runtime";
import { exchangeWorkSecret } from "../../../../lib/work/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJson(request, 8_192);
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>).jobId !== "string" ||
      typeof (body as Record<string, unknown>).secret !== "string"
    ) {
      return NextResponse.json({ error: "INVALID_SESSION_REQUEST" }, { status: 400 });
    }

    const result = await exchangeWorkSecret({
      store: getWorkStore(),
      jobId: (body as { jobId: string }).jobId,
      secret: (body as { secret: string }).secret,
      signingKey: getWorkSigningKey()
    });

    const response = NextResponse.json({
      attempt: result.attempt,
      csrfToken: result.csrfToken
    });

    response.cookies.set(WORK_SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/work",
      maxAge: 15 * 60
    });

    return response;
  } catch (error) {
    return workApiError(error);
  }
}
