import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import workResultSchema from "../../contracts/work-result.schema.json";

export type ValidationResult =
  | { success: true; value: unknown }
  | { success: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(workResultSchema);

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath || "/";
    return `${path} ${error.message ?? "is invalid"}`;
  });
}

export function validateWorkResult(input: unknown): ValidationResult {
  if (!validate(input)) {
    return { success: false, errors: formatErrors(validate.errors) };
  }
  return { success: true, value: input };
}
