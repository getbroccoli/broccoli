import { invalidInput } from "../../../core/application-error";

const MAX_NAME_LENGTH = 100;

/** The company name as stored: trimmed, 1 to 100 characters. */
export function parseCompanyName(raw: string): string {
  const name = raw.trim();
  if (name === "") {
    throw invalidInput([{ field: "name", code: "required" }]);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw invalidInput([{ field: "name", code: "tooLong" }]);
  }
  return name;
}
