import { z } from "zod";

import { type Actor, requireOwner } from "../../../../core/actor";
import type { EmployeeRepository } from "../../db";

/** Whether this file is an employee's avatar, so the avatar route may serve it. */
export async function isEmployeeAvatar(
  employees: EmployeeRepository,
  actor: Actor,
  fileId: string,
): Promise<boolean> {
  requireOwner(actor);
  // Postgres refuses a malformed uuid, so only a parsed one reaches the query.
  const id = z.uuid().safeParse(fileId);
  return id.success && (await employees.hasAvatar(id.data));
}
