import { describe, expect, it } from "vitest";
import { classifySubmission } from "../../lib/work/idempotency";

describe("Work result idempotency", () => {
  it("accepts the first result", () => {
    expect(classifySubmission(null, "aaa")).toBe("accept");
  });

  it("treats an identical result as an idempotent replay", () => {
    expect(classifySubmission("aaa", "aaa")).toBe("replay");
  });

  it("rejects a different second result", () => {
    expect(classifySubmission("aaa", "bbb")).toBe("conflict");
  });
});
