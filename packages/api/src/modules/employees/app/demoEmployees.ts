import type { Orm, Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { RasterImage } from "../../../utils";
import { employeeRepository } from "../db";
import { type NewEmployeeInput, parseNewEmployee } from "../domain";
import { setNewEmployeeManagers } from "./setNewEmployeeManagers";
import { recordCreatedEmployees } from "./recordCreatedEmployees";

/** A demo employee, their avatar and the email of their manager among the demo employees. */
export interface DemoEmployee {
  employee: NewEmployeeInput;
  avatar: RasterImage;
  managerEmail?: string | null;
}

/**
 * Adds the demo employees with their avatars, joining `tx`, to an instance without
 * employees, with `cause` on their creation lines; otherwise does nothing.
 */
export async function createDemoEmployees(
  ctx: SecurityContext,
  tx: Tx,
  demoEmployees: readonly DemoEmployee[],
  cause: HistoryAppend["cause"],
) {
  ctx.require("MANAGE_WORKSPACE");
  if (await employeeRepository(tx).hasAny()) {
    return;
  }
  const employees = await employeeRepository(tx).insertDemo(
    demoEmployees.map(({ employee, avatar }) => ({ employee: parseNewEmployee(employee), avatar })),
  );
  const managerEmails = new Map(
    demoEmployees.flatMap(({ employee, managerEmail }) =>
      managerEmail ? [[employee.email, managerEmail] as const] : [],
    ),
  );
  const managers = await setNewEmployeeManagers(tx, employees, managerEmails);
  await recordCreatedEmployees(ctx, tx, employees, cause, managers);
}

/** Whether the instance holds demo employees, such as when setup leaves the demo; joins `db`. */
export function hasDemoEmployees(ctx: SecurityContext, db: Orm | Tx): Promise<boolean> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  return employeeRepository(db).hasDemo();
}
