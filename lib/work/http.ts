export class HttpInputError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = "HttpInputError";
  }
}

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Uint8Array> {
  if (body === null) {
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("payload too large");
        throw new HttpInputError("PAYLOAD_TOO_LARGE", 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
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

  const bytes = await readBoundedBody(request.body, maxBytes);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpInputError("INVALID_JSON", 400);
  }
}
