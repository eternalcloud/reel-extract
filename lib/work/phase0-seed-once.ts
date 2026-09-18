export type ExistingSeed = {
  attempt: number;
  secretHash: string;
  secretExpiresAt: number;
};

export function canReuseFixedSeed(
  existing: ExistingSeed | null,
  fixedHash: string,
  nowMs = Date.now()
): boolean {
  return (
    existing !== null &&
    existing.secretHash === fixedHash &&
    existing.secretExpiresAt > nowMs
  );
}
