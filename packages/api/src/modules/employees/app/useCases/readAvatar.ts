import { z } from "zod";

import type { Orm } from "../../../../core/db";
import { readFile, type StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import type { EmployeeRepository } from "../../db";

/** The avatar file with this id, or null when it is no employee's avatar. */
export async function readAvatar(
  { orm, employees }: { orm: Orm; employees: EmployeeRepository },
  ctx: SecurityContext,
  fileId: string,
): Promise<StoredFile | null> {
  ctx.requireOwnerOrSystem();
  // Postgres refuses a malformed uuid, so only a parsed one reaches the query.
  const id = z.uuid().safeParse(fileId);
  return id.success && (await employees.hasAvatar(id.data)) ? readFile(orm, id.data) : null;
}
