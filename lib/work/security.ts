import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type WorkSessionClaims = {
  jobId: string;
  attempt: number;
  expiresAt: number;
};

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(value: string, key: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashWorkSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function issueWorkSession(claims: WorkSessionClaims, signingKey: string): string {
  if (!claims.jobId || !Number.isInteger(claims.attempt) || claims.attempt < 1) {
    throw new Error("invalid work session claims");
  }
  if (!Number.isFinite(claims.expiresAt)) {
    throw new Error("invalid work session expiry");
  }
  if (signingKey.length < 32) {
    throw new Error("work session signing key must be at least 32 characters");
  }

  const payload = base64Url(JSON.stringify(claims));
  const signature = base64Url(hmac(payload, signingKey));
  return `${payload}.${signature}`;
}

export function verifyWorkSession(
  token: string,
  signingKey: string,
  nowMs = Date.now()
): WorkSessionClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined || signingKey.length < 32) {
    return null;
  }

  const expected = hmac(payload, signingKey);
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (!safeEqual(expected, supplied)) {
    return null;
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof (claims as WorkSessionClaims).jobId !== "string" ||
    !Number.isInteger((claims as WorkSessionClaims).attempt) ||
    (claims as WorkSessionClaims).attempt < 1 ||
    typeof (claims as WorkSessionClaims).expiresAt !== "number" ||
    (claims as WorkSessionClaims).expiresAt < nowMs
  ) {
    return null;
  }

  return claims as WorkSessionClaims;
}

export function deriveCsrfToken(sessionToken: string, signingKey: string): string {
  return base64Url(hmac(`csrf:${sessionToken}`, signingKey));
}

export function isAllowedOrigin(origin: string | null, expectedOrigin: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
