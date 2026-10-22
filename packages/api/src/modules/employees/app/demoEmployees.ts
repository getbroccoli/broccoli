import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { RasterImage } from "../../../utils";
import { employeeRepository } from "../db";
import { type NewEmployeeInput, parseNewEmployee } from "../domain";

/** A demo employee and their avatar. */
export interface DemoEmployee {
  employee: NewEmployeeInput;
  avatar: RasterImage;
}

/**
 * Adds the demo employees with their avatars, joining `tx`, to an instance without
 * employees; otherwise does nothing.
 */
export async function createDemoEmployees(
  ctx: SecurityContext,
  tx: Tx,
  demoEmployees: readonly DemoEmployee[],
) {
  ctx.requireOwnerOrSystem();
  if (await employeeRepository(tx).hasAny()) {
    return;
  }
  await employeeRepository(tx).insertDemo(
    demoEmployees.map(({ employee, avatar }) => ({ employee: parseNewEmployee(employee), avatar })),
  );
}

/** Whether the instance holds demo employees; joins `db`. */
export function hasDemoEmployees(ctx: SecurityContext, db: Orm | Tx): Promise<boolean> {
  ctx.requireOwnerOrSystem();
  return employeeRepository(db).hasDemo();
}
