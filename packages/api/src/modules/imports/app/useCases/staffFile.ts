import { parseCsv, parseXlsx } from "../../../../utils";
import { checkSheets, type FileSheet, type SheetRefusal } from "../../domain";

/** A staff file's sheets: a CSV file's one, or an Excel workbook's visible ones, within the limits. */
export async function readStaffFile(bytes: Uint8Array): Promise<FileSheet[] | SheetRefusal> {
  const sheets = isExcelWorkbook(bytes) ? await excelWorkbook(bytes) : csvSheet(bytes);
  return sheets === null ? "unsupported_file" : checkSheets(sheets);
}

/** Every Excel workbook is a ZIP archive, which starts with this signature. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function isExcelWorkbook(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** The workbook's visible sheets, each with its name; null when it cannot be read. */
function excelWorkbook(bytes: Uint8Array): Promise<FileSheet[] | null> {
  return parseXlsx(bytes);
}

/** A CSV file as one sheet without a name; null when it is not text. */
function csvSheet(bytes: Uint8Array): FileSheet[] | null {
  const rows = parseCsv(bytes);
  return rows === null ? null : [{ name: null, rows }];
}
