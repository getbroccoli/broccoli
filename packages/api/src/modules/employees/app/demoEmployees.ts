import type { Orm, Tx } from "../../../core/db";
import { deleteFiles, storeFile } from "../../../core/files";
import type { RasterImage } from "../../../utils";
import { employeeRepository } from "../db";
import { type NewEmployeeInput, parseNewEmployee } from "../domain";

/** A demo employee and their avatar. */
export interface DemoEmployee {
  employee: NewEmployeeInput;
  avatar: RasterImage;
}

/** Adds the demo employees with their avatars, joining `tx`. */
export async function createDemoEmployees(tx: Tx, demoEmployees: readonly DemoEmployee[]) {
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
export async function clearDemoEmployees(tx: Tx): Promise<void> {
  // Rows first: a file that an employee still references cannot be deleted.
  const avatarFileIds = await employeeRepository(tx).deleteDemo();
  await deleteFiles(tx, avatarFileIds);
}

/** Whether any employee exists, demo or real, joining `tx`. */
export function hasEmployees(tx: Tx): Promise<boolean> {
  return employeeRepository(tx).hasAny();
}

export function hasDemoEmployees(orm: Orm): Promise<boolean> {
  return employeeRepository(orm).hasDemo();
}
