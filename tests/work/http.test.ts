import { describe, expect, it } from "vitest";
import { HttpInputError, readBoundedJson } from "../../lib/work/http";

async function expectHttpError(
  promise: Promise<unknown>,
  code: string,
  status: number
) {
  try {
    await promise;
    throw new Error("expected HttpInputError");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpInputError);
    expect(error).toMatchObject({ code, status });
  }
}

describe("readBoundedJson", () => {
  it("accepts application/json and parses the body", async () => {
    const request = new Request("https://reel.example.com/api/work/result", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true })
    });

    await expect(readBoundedJson(request)).resolves.toEqual({ ok: true });
  });

  it("rejects non-JSON content types", async () => {
    const request = new Request("https://reel.example.com/api/work/result", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}"
    });

    await expectHttpError(
      readBoundedJson(request),
      "CONTENT_TYPE_REJECTED",
      415
    );
  });

  it("rejects invalid JSON", async () => {
    const request = new Request("https://reel.example.com/api/work/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json"
    });

    await expectHttpError(readBoundedJson(request), "INVALID_JSON", 400);
  });

  it("rejects declared and actual bodies above the byte limit", async () => {
    const declared = new Request("https://reel.example.com/api/work/result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "9999"
      },
      body: "{}"
    });

    await expectHttpError(
      readBoundedJson(declared, 100),
      "PAYLOAD_TOO_LARGE",
      413
    );

    const actual = new Request("https://reel.example.com/api/work/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(200) })
    });

    await expectHttpError(
      readBoundedJson(actual, 100),
      "PAYLOAD_TOO_LARGE",
      413
    );
  });
});
