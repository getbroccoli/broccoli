import { z } from "zod";

import type { EmployeeKeyset } from "./employee-repository";

const keysetSchema = z.tuple([z.string(), z.string(), z.uuid()]);

/** An opaque cursor: the keyset as base64url JSON. */
export function encodeCursor(keyset: EmployeeKeyset): string {
  return Buffer.from(JSON.stringify(keyset)).toString("base64url");
}

/** The keyset of a cursor, or null when it is not one this API issued. */
export function decodeCursor(cursor: string): EmployeeKeyset | null {
  try {
    const result = keysetSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
