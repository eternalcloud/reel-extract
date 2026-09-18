import { describe, expect, it } from "vitest";
import { canReuseFixedSeed } from "../../lib/work/phase0-seed-once";

const fixedHash = "a".repeat(64);

describe("canReuseFixedSeed", () => {
  it("reuses only the same unexpired fixed seed", () => {
    expect(
      canReuseFixedSeed(
        { attempt: 2, secretHash: fixedHash, secretExpiresAt: 2_000 },
        fixedHash,
        1_000
      )
    ).toBe(true);
  });

  it("does not reuse missing, expired, or different seeds", () => {
    expect(canReuseFixedSeed(null, fixedHash, 1_000)).toBe(false);
    expect(
      canReuseFixedSeed(
        { attempt: 2, secretHash: fixedHash, secretExpiresAt: 999 },
        fixedHash,
        1_000
      )
    ).toBe(false);
    expect(
      canReuseFixedSeed(
        { attempt: 2, secretHash: "b".repeat(64), secretExpiresAt: 2_000 },
        fixedHash,
        1_000
      )
    ).toBe(false);
  });
});
