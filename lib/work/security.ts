export type WorkSessionClaims = {
  jobId: string;
  attempt: number;
  expiresAt: number;
};

export function hashWorkSecret(_secret: string): string {
  return "";
}

export function issueWorkSession(
  _claims: WorkSessionClaims,
  _signingKey: string
): string {
  throw new Error("not implemented");
}

export function verifyWorkSession(
  _token: string,
  _signingKey: string,
  _nowMs = Date.now()
): WorkSessionClaims | null {
  return null;
}

export function deriveCsrfToken(_sessionToken: string, _signingKey: string): string {
  return "";
}

export function isAllowedOrigin(_origin: string | null, _expectedOrigin: string): boolean {
  return false;
}
