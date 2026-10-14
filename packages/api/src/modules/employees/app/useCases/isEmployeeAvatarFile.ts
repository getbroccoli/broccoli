import { z } from "zod";

import type { SecurityContext } from "../../../../core/security";
import type { EmployeeRepository } from "../../db";

/** Whether this file is an employee's avatar, so the avatar route may serve it. */
export async function isEmployeeAvatarFile(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  fileId: string,
): Promise<boolean> {
  ctx.requireOwnerOrSystem();
  // Postgres refuses a malformed uuid, so only a parsed one reaches the query.
  const id = z.uuid().safeParse(fileId);
  return id.success && (await employees.hasAvatar(id.data));
}
