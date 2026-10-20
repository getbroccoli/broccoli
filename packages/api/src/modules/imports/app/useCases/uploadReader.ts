import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { FileSheet } from "../../domain";
import { readStaffFile } from "./staffFile";

/** Reads an uploaded staff file's sheets, refusing one that cannot be read with the field `file`. */
export type UploadReader = (bytes: Uint8Array) => Promise<FileSheet[]>;

/**
 * One upload is read at a time and another is refused meanwhile, so uploads can't fill the
 * workbook reader's line; the web uploads one file after another. Jobs always wait their turn.
 * Every way of uploading shares the one reader this returns.
 */
export function createUploadReader(): UploadReader {
  let reading = false;
  return async (bytes) => {
    if (reading) {
      throw new ApplicationError(
        "UNAVAILABLE",
        "Another file is being read. Try again in a moment.",
      );
    }
    reading = true;
    try {
      const sheets = await readStaffFile(bytes);
      if (typeof sheets === "string") {
        throw invalidInput([{ field: "file", code: sheets }]);
      }
      return sheets;
    } finally {
      reading = false;
    }
  };
}

/** A CSV has one unnamed sheet; only a workbook names its sheets. */
export function mimeTypeOf(sheets: FileSheet[]): string {
  return sheets.some(({ name }) => name !== null)
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
}
