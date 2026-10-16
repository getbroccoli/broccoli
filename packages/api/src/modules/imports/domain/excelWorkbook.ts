import { parseXlsx } from "../../../utils";

import type { FileSheet } from "./sheet";

/** Whether the bytes are an Excel workbook, which is always a ZIP archive. */
export function isExcelWorkbook(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** The workbook's visible sheets, each with its name; null when it cannot be read. */
export function excelWorkbook(bytes: Uint8Array): Promise<FileSheet[] | null> {
  return parseXlsx(bytes);
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
