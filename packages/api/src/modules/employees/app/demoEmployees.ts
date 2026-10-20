import type { Orm, Tx } from "../../../core/db";
import { deleteFiles, storeFile } from "../../../core/files";
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
  const newEmployees = demoEmployees.map(({ employee }) => parseNewEmployee(employee));
  const avatarFileIds: string[] = [];
  for (const { avatar } of demoEmployees) {
    avatarFileIds.push(await storeFile(tx, { content: avatar.bytes, mimeType: avatar.mimeType }));
  }
  await employeeRepository(tx).insertMany(
    newEmployees.map((employee, index) => ({
      ...employee,
      avatarFileId: avatarFileIds[index]!,
      isDemo: true,
    })),
  );
}

/** Deletes the demo employees and their avatars, joining `tx`; real employees stay. */
export async function clearDemoEmployees(ctx: SecurityContext, tx: Tx): Promise<void> {
  ctx.requireOwnerOrSystem();
  // Rows first: a file that an employee still references cannot be deleted.
  const avatarFileIds = await employeeRepository(tx).deleteDemo();
  await deleteFiles(tx, avatarFileIds);
}

export function hasDemoEmployees(ctx: SecurityContext, orm: Orm): Promise<boolean> {
  ctx.requireOwnerOrSystem();
  return employeeRepository(orm).hasDemo();
}
