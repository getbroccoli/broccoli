import { createHash } from "node:crypto";

import type { ImportEmployee } from "./importEmployee";

/**
 * A fingerprint of everything Approve would create from these import employees: every value,
 * who is left out, each photo. It changes whenever review would show something else.
 */
export function importVersion(employees: readonly ImportEmployee[]): string {
  return createHash("sha256").update(JSON.stringify(employees)).digest("base64url");
}
