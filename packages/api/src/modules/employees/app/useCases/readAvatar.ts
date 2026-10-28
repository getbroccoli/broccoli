import type { Orm } from "../../../../core/db";
import { readFile, type StoredFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import type { EmployeeRepository } from "../../db";

/** The avatar file with this id, or null when it is no employee's avatar. */
export async function readAvatar(
  { orm, employees }: { orm: Orm; employees: EmployeeRepository },
  ctx: SecurityContext,
  fileId: string,
): Promise<StoredFile | null> {
  ctx.requireEveryRecord("employee", "read");
  const id = parseUuid(fileId);
  return id && (await employees.hasAvatar(id)) ? readFile(orm, id) : null;
}
