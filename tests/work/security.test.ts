import { describe, expect, it } from "vitest";
import {
  deriveCsrfToken,
  hashWorkSecret,
  isAllowedOrigin,
  issueWorkSession,
  verifyWorkSession
} from "../../lib/work/security";

describe("Work capability security", () => {
  const key = "phase-0-test-signing-key-with-enough-entropy";

  it("hashes Work secrets without returning plaintext", () => {
    const hash = hashWorkSecret("fragment-secret");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("fragment-secret");
    expect(hashWorkSecret("fragment-secret")).toBe(hash);
  });

  it("round-trips signed job-scoped session claims", () => {
    const claims = {
      jobId: "11111111-1111-4111-8111-111111111111",
      attempt: 2,
      expiresAt: 2_000_000_000_000
    };
    const token = issueWorkSession(claims, key);

    expect(verifyWorkSession(token, key, 1_900_000_000_000)).toEqual(claims);
  });

  it("rejects tampered and expired sessions", () => {
    const claims = {
      jobId: "11111111-1111-4111-8111-111111111111",
      attempt: 1,
      expiresAt: 2_000
    };
    const token = issueWorkSession(claims, key);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    expect(verifyWorkSession(tampered, key, 1_000)).toBeNull();
    expect(verifyWorkSession(token, key, 2_001)).toBeNull();
  });

  it("derives a session-bound CSRF token", () => {
    const a = deriveCsrfToken("session-a", key);
    const b = deriveCsrfToken("session-b", key);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(deriveCsrfToken("session-a", key)).toBe(a);
  });

  it("accepts only the exact configured origin", () => {
    expect(isAllowedOrigin("https://reel.example.com", "https://reel.example.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", "https://reel.example.com")).toBe(false);
    expect(isAllowedOrigin(null, "https://reel.example.com")).toBe(false);
  });
});
