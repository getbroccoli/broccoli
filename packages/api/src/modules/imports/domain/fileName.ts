import { invalidInput } from "../../../core/applicationError";

/** A staff file's name as the browser sent it; only `.csv` and `.xlsx` files are read. */
export function parseStaffFileName(name: unknown): string {
  if (typeof name !== "string" || !/\.(csv|xlsx)$/i.test(name)) {
    throw invalidInput([{ field: "file", code: "unsupported_file" }]);
  }
  return name.slice(-MAX_FILE_NAME_LENGTH);
}

const MAX_FILE_NAME_LENGTH = 255;
