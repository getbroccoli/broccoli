import { parseCsv } from "../../../utils";

import type { FileSheet } from "./sheet";

/** A CSV file as one sheet without a name; null when it is not text. */
export function csvSheet(bytes: Uint8Array): FileSheet[] | null {
  const rows = parseCsv(bytes);
  return rows === null ? null : [{ name: null, rows }];
}
