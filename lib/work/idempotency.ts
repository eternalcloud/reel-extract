export type SubmissionDisposition = "accept" | "replay" | "conflict";

export function classifySubmission(
  existingSha256: string | null,
  incomingSha256: string
): SubmissionDisposition {
  if (existingSha256 === null) return "accept";
  return existingSha256 === incomingSha256 ? "replay" : "conflict";
}
