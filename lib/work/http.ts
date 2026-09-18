export class HttpInputError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
  }
}

export async function readBoundedJson(
  _request: Request,
  _maxBytes = 256_000
): Promise<unknown> {
  throw new HttpInputError("NOT_IMPLEMENTED", 501);
}
