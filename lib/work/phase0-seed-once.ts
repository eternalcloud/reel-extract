export type ExistingSeed = {
  attempt: number;
  secretHash: string;
  secretExpiresAt: number;
};

export function canReuseFixedSeed(
  _existing: ExistingSeed | null,
  _fixedHash: string,
  _nowMs = Date.now()
): boolean {
  return false;
}
