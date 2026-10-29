import type { Orm } from "../../../../core/db";
import { readFile, type StoredFile } from "../../../../core/files";
import { ApplicationError } from "../../../../core/applicationError";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import type { EmployeeRepository } from "../../db";

/** The avatar file with this id, or null when it is no employee's avatar. */
export async function readAvatar(
  { orm, employees }: { orm: Orm; employees: EmployeeRepository },
  ctx: SecurityContext,
  fileId: string,
): Promise<StoredFile | null> {
  const id = parseUuid(fileId);
  const employeeIds = id ? await employees.findIdsByAvatar(id) : [];
  if (!id || employeeIds.length === 0) {
    ctx.requireEveryRecord("employee", "read");
    return null;
  }
  // Imported people can share a photo: any of them in scope makes it readable.
  const scope = await ctx.recordScope("employee", "read");
  if (!employeeIds.some((employeeId) => isInRecordScope(scope, employeeId))) {
    throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
  }
  return readFile(orm, id);
}
