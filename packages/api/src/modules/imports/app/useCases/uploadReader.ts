import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { FileSheet } from "../../domain";
import { readStaffFile } from "./staffFile";

/**
 * Reads an uploaded staff file, refusing one that cannot be read with the field `file`. A `.pdf`
 * is taken as it is, when its bytes are a PDF.
 */
export type UploadReader = (file: { name: string; bytes: Uint8Array }) => Promise<StaffUpload>;

/** A staff file as uploaded: its sheets, or null for a PDF, whose rows Broccoli cannot read. */
export interface StaffUpload {
  mimeType: string;
  sheets: FileSheet[] | null;
}

export const PDF_MIME_TYPE = "application/pdf";

/**
 * One upload is read at a time and another is refused meanwhile, so uploads can't fill the
 * workbook reader's line; the web uploads one file after another. Jobs always wait their turn.
 * Every way of uploading shares the one reader this returns.
 */
export function createUploadReader(): UploadReader {
  let reading = false;
  return async ({ name, bytes }) => {
    if (/\.pdf$/i.test(name)) {
      return readPdf(bytes);
    }
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
      return { mimeType: mimeTypeOf(sheets), sheets };
    } finally {
      reading = false;
    }
  };
}

/** Every PDF starts with this signature. */
const PDF_SIGNATURE = Buffer.from("%PDF-");

function readPdf(bytes: Uint8Array): StaffUpload {
  if (!Buffer.from(bytes.subarray(0, PDF_SIGNATURE.length)).equals(PDF_SIGNATURE)) {
    throw invalidInput([{ field: "file", code: "unsupported_file" }]);
  }
  return { mimeType: PDF_MIME_TYPE, sheets: null };
}

/** A CSV has one unnamed sheet; only a workbook names its sheets. */
function mimeTypeOf(sheets: FileSheet[]): string {
  return sheets.some(({ name }) => name !== null)
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
}
