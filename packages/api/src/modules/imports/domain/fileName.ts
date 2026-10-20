import { invalidInput } from "../../../core/applicationError";

/**
 * The name of the file the external agent read, of any type, without control characters and at
 * most 255 characters; refused with INVALID_INPUT when nothing is left.
 */
export function parseParsedFileName(name: unknown): string {
  // eslint-disable-next-line no-control-regex -- control characters are what is removed
  const cleaned = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  if (cleaned === "") {
    throw invalidInput([{ field: "name", code: "required" }]);
  }
  return cleaned.slice(-MAX_FILE_NAME_LENGTH);
}

/** A staff file's name as the browser sent it; only `.csv` and `.xlsx` files are read. */
export function parseStaffFileName(name: unknown): string {
  if (typeof name !== "string" || !/\.(csv|xlsx)$/i.test(name)) {
    throw invalidInput([{ field: "file", code: "unsupported_file" }]);
  }
  return name.slice(-MAX_FILE_NAME_LENGTH);
}

const MAX_FILE_NAME_LENGTH = 255;
