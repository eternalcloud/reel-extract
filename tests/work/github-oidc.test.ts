import { describe, expect, it } from "vitest";
import {
  assertPhase0SeedClaims,
  PHASE0_SEED_AUDIENCE
} from "../../lib/work/github-oidc";

const valid = {
  repository: "eternalcloud/reel-extract",
  repository_id: "1375496851",
  repository_owner_id: "39610742",
  ref: "refs/heads/main",
  event_name: "push",
  workflow_ref:
    "eternalcloud/reel-extract/.github/workflows/phase0-seed-once.yml@refs/heads/main"
};

describe("GitHub Phase 0 OIDC claims", () => {
  it("uses a dedicated audience", () => {
    expect(PHASE0_SEED_AUDIENCE).toBe("reel-extract-phase0");
  });

  it("accepts only the exact main-branch seeding workflow", () => {
    expect(() => assertPhase0SeedClaims(valid)).not.toThrow();
  });

  it.each([
    ["repository", "someone/fork"],
    ["repository_id", "1"],
    ["repository_owner_id", "1"],
    ["ref", "refs/heads/feature"],
    ["event_name", "pull_request"],
    [
      "workflow_ref",
      "eternalcloud/reel-extract/.github/workflows/other.yml@refs/heads/main"
    ]
  ])("rejects invalid %s", (key, value) => {
    expect(() =>
      assertPhase0SeedClaims({ ...valid, [key]: value })
    ).toThrow(/OIDC claim rejected/);
  });
});
