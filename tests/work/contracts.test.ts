import { describe, expect, it } from "vitest";
import { validateWorkResult } from "../../lib/work/contracts";
import { validWorkResult } from "../fixtures/work-result";

describe("validateWorkResult", () => {
  it("accepts a schema-valid Work result", () => {
    const result = validateWorkResult(validWorkResult);
    expect(result.success).toBe(true);
  });

  it("rejects additional top-level properties", () => {
    const result = validateWorkResult({ ...validWorkResult, unexpected: true });
    expect(result.success).toBe(false);
  });

  it("rejects website candidates with no observed or official URL", () => {
    const broken = structuredClone(validWorkResult) as any;
    broken.candidates[1].website.observed_url = null;
    broken.candidates[1].website.official_url = null;

    const result = validateWorkResult(broken);
    expect(result.success).toBe(false);
  });
});
