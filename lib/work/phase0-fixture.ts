export const PHASE0_JOB_ID = "11111111-1111-4111-8111-111111111111";
export const PHASE0_SECRET = "phase0-local-fragment-secret";

export type Phase0Evidence = {
  schema_version: 1;
  job_id: string;
  source: { platform: "instagram"; url: string; creator: string | null };
  caption: { available: boolean; text: string };
  transcript: {
    available: boolean;
    language: string;
    segments: Array<{ timestamp_ms: number; text: string }>;
  };
  frames: Array<{ timestamp_ms: number; asset_url: string; sha256: string }>;
};

export function getPhase0Evidence(_jobId: string): Phase0Evidence | null {
  return null;
}
