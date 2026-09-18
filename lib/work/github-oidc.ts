export const PHASE0_SEED_AUDIENCE = "reel-extract-phase0";

export type GitHubOidcClaims = {
  repository?: unknown;
  repository_id?: unknown;
  repository_owner_id?: unknown;
  ref?: unknown;
  event_name?: unknown;
  workflow_ref?: unknown;
};

export function assertPhase0SeedClaims(_claims: GitHubOidcClaims): void {
  throw new Error("not implemented");
}
