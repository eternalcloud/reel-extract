export type ValidationResult =
  | { success: true; value: unknown }
  | { success: false; errors: string[] };

export function validateWorkResult(_input: unknown): ValidationResult {
  return { success: false, errors: ["not implemented"] };
}
