export class HttpInputError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = "HttpInputError";
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes = 256_000
): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw new HttpInputError("CONTENT_TYPE_REJECTED", 415);
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new HttpInputError("PAYLOAD_TOO_LARGE", 413);
    }
  }

  const text = await request.text();
  const actualBytes = new TextEncoder().encode(text).byteLength;
  if (actualBytes > maxBytes) {
    throw new HttpInputError("PAYLOAD_TOO_LARGE", 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpInputError("INVALID_JSON", 400);
  }
}
