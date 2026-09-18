import { describe, expect, it } from "vitest";
import { buildStarterResult } from "../../lib/work/starter-result";
import { validateWorkResult } from "../../lib/work/contracts";

describe("Work starter result", () => {
  it("is intentionally invalid until candidates are replaced", () => {
    const starter = buildStarterResult(
      "11111111-1111-4111-8111-111111111111",
      3
    );

    expect(starter.candidates).toBe("__REPLACE_WITH_EXTRACTED_CANDIDATES__");
    expect(validateWorkResult(starter).success).toBe(false);
  });
});
