export function buildStarterResult(jobId: string, attempt: number) {
  return {
    schema_version: 1,
    job_id: jobId,
    attempt,
    candidates: "__REPLACE_WITH_EXTRACTED_CANDIDATES__",
    warnings: []
  };
}
