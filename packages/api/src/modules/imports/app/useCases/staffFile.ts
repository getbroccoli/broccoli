import { parseCsv, parseXlsx } from "../../../../utils";
import { checkSheets, type FileSheet, type SheetRefusal } from "../../domain";

/**
 * A spreadsheet's sheets, within the limits: a CSV file's one or an Excel workbook's visible ones.
 * The content decides, not the name; a PDF is read by the PDF extraction instead.
 */
export async function readStaffFile(bytes: Uint8Array): Promise<FileSheet[] | SheetRefusal> {
  const sheets = isZipArchive(bytes) ? await parseXlsx(bytes) : csvSheet(bytes);
  return sheets === null ? "unsupported_file" : checkSheets(sheets);
}

/** Whether the content is a PDF, as `staffFileMimeType` decides it. */
export function isPdfFile(bytes: Uint8Array): boolean {
  return staffFileKind(bytes) === "pdf";
}

/** The media type of a staff file, decided by its content like `readStaffFile`. */
export function staffFileMimeType(bytes: Uint8Array): string {
  return MIME_TYPES[staffFileKind(bytes)];
}

type StaffFileKind = "excel" | "pdf" | "csv";

function staffFileKind(bytes: Uint8Array): StaffFileKind {
  if (isZipArchive(bytes)) return "excel";
  if (isPdf(bytes)) return "pdf";
  return "csv";
}

/** Every Excel workbook is a ZIP archive, which starts with this signature. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function isZipArchive(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** PDF readers find the header within the first 1024 bytes, so it may follow some junk. */
function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 1024)).includes("%PDF-");
}

/** A CSV file as one sheet without a name; null when it is not text. */
function csvSheet(bytes: Uint8Array): FileSheet[] | null {
  const rows = parseCsv(bytes);
  return rows === null ? null : [{ name: null, rows }];
}

const MIME_TYPES: Record<StaffFileKind, string> = {
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv",
};
