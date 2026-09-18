import { describe, expect, it } from "vitest";
import {
  getPhase0Evidence,
  PHASE0_JOB_ID
} from "../../lib/work/phase0-fixture";

describe("Phase 0 synthetic evidence", () => {
  it("contains caption, transcript, frame, ambiguity and prompt-injection evidence", () => {
    const evidence = getPhase0Evidence(PHASE0_JOB_ID);
    expect(evidence).not.toBeNull();

    expect(evidence?.caption.available).toBe(true);
    expect(evidence?.caption.text).toMatch(/Jewel Changi Airport/i);

    expect(evidence?.transcript.available).toBe(true);
    expect(evidence?.transcript.segments.some((s) => /Gardens by the Bay/i.test(s.text))).toBe(true);
    expect(evidence?.transcript.segments.some((s) => /Central/i.test(s.text))).toBe(true);

    expect(evidence?.frames).toHaveLength(1);
    expect(evidence?.frames[0].asset_url).toContain("phase0-example");

    const allText = [
      evidence?.caption.text,
      ...(evidence?.transcript.segments.map((s) => s.text) ?? [])
    ].join("\n");
    expect(allText).toMatch(/ignore previous instructions/i);
  });

  it("does not expose evidence for a different job id", () => {
    expect(
      getPhase0Evidence("22222222-2222-4222-8222-222222222222")
    ).toBeNull();
  });
});
