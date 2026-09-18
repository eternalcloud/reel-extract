import { NextResponse } from "next/server";
import { HttpInputError } from "./http";
import { WorkRequestError } from "./service";

export function workApiError(error: unknown): NextResponse {
  if (error instanceof HttpInputError || error instanceof WorkRequestError) {
    return NextResponse.json(
      {
        error: error.code,
        ...(error instanceof WorkRequestError && error.details
          ? { details: error.details }
          : {})
      },
      { status: error.status }
    );
  }

  console.error("Unexpected Work API error", error);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
