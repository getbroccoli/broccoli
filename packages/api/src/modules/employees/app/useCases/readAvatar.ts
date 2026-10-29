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
  const id = parseUuid(fileId);
  const employeeId = id ? await employees.findIdByAvatar(id) : null;
  if (!id || !employeeId) {
    ctx.requireEveryRecord("employee", "read");
    return null;
  }
  await ctx.requireInScope("employee", "read", employeeId);
  return readFile(orm, id);
}
