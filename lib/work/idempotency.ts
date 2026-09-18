export type SubmissionDisposition = "accept" | "replay" | "conflict";

export function classifySubmission(
  _existingSha256: string | null,
  _incomingSha256: string
): SubmissionDisposition {
  return "conflict";
}
