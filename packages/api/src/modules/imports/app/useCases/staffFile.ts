import { parseCsv, parsePdf, parseXlsx } from "../../../../utils";
import { checkSheets, type FileSheet, type SheetRefusal } from "../../domain";
import { hasScannedPage, pdfSheets } from "../../pdfExtraction";

/**
 * A staff file's sheets, within the limits: a CSV file's one, an Excel workbook's visible ones, or
 * a PDF's table. The content decides, not the name.
 */
export async function readStaffFile(bytes: Uint8Array): Promise<FileSheet[] | SheetRefusal> {
  const sheets = await readSheets(bytes);
  if (sheets === null) return "unsupported_file";
  return typeof sheets === "string" ? sheets : checkSheets(sheets);
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

function readSheets(
  bytes: Uint8Array,
): Promise<FileSheet[] | PdfRefusal | null> | FileSheet[] | null {
  switch (staffFileKind(bytes)) {
    case "excel":
      return parseXlsx(bytes);
    case "pdf":
      return pdfTable(bytes);
    case "csv":
      return csvSheet(bytes);
  }
}

type PdfRefusal = "scanned_pdf" | "encrypted_pdf" | "no_table";

/**
 * The PDF's tables as sheets, or why it is refused: a password, a scanned page, or no table or
 * staff content that cannot be read in full. Null when it cannot be read.
 */
async function pdfTable(bytes: Uint8Array): Promise<FileSheet[] | PdfRefusal | null> {
  const pages = await parsePdf(bytes);
  if (pages === "encrypted") return "encrypted_pdf";
  if (pages && hasScannedPage(pages)) return "scanned_pdf";
  if (pages === null) return null;
  return pdfSheets(pages) ?? "no_table";
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
