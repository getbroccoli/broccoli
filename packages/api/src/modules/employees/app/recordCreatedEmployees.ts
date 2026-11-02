import type { Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { employmentRepository, locationRepository } from "../db";
import { type Employee, employeeChanges, locationChanges, managerChanges } from "../domain";

const recordHistory = createRecordHistoryService();

/** Appends a creation line for each of these new employees, with their location and manager by id, joining `tx`. */
export async function recordCreatedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  employees: readonly Employee[],
  cause: HistoryAppend["cause"],
  managers: ReadonlyMap<string, Employee> = new Map(),
): Promise<void> {
  const startDates = await employmentRepository(tx).findStartDates(employees.map(({ id }) => id));
  const locationIds = [...new Set(employees.flatMap(({ locationId }) => locationId ?? []))];
  const locations = new Map(
    (locationIds.length === 0 ? [] : await locationRepository(tx).findByIds(locationIds)).map(
      (location) => [location.id, location],
    ),
  );
  await recordHistory.append(ctx, tx, {
    recordType: "employee",
    operation: "CREATED",
    cause,
    records: employees.map((employee) => ({
      recordId: employee.id,
      changes: [
        ...employeeChanges(null, { ...employee, startDate: startDates.get(employee.id) ?? null }),
        ...locationChanges(null, locations.get(employee.locationId ?? "") ?? null),
        ...managerChanges(null, managers.get(employee.id) ?? null),
      ],
    })),
  });
}
