import { describe, expect, it } from "vitest";
import { canonicalJson, sha256CanonicalJson } from "../../lib/work/canonical-json";

describe("canonical JSON", () => {
  it("is stable across object key order", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("preserves array ordering", () => {
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it("produces the same hash for semantically identical key ordering", () => {
    expect(sha256CanonicalJson({ b: 2, a: 1 })).toBe(
      sha256CanonicalJson({ a: 1, b: 2 })
    );
  });
});
