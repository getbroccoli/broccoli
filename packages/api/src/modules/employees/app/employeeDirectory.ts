import type { Orm } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import type { EmployeeDirectory } from "../../../core/security";
import { todayInUtc } from "../../../utils";
import { employeeRepository, employmentRepository } from "../db";

const owners = createOwnerService();

/** What permission checks read about people: who a user is, and who is above whom today. */
export function employeeDirectory(orm: Orm): EmployeeDirectory {
  const employees = employeeRepository(orm);
  const employments = employmentRepository(orm);
  const employeeIdOfUser = async (userId: string) =>
    (await employees.findByUserId(userId))?.id ?? null;
  return {
    employeeIdOfUser,
    // One query, so the whole line is read as it was at one moment.
    managersAbove: (employeeIds) => employments.findManagersAbove(employeeIds, todayInUtc()),
    reportsBelow: (employeeId) => employments.findReportsBelow(employeeId, todayInUtc()),
    ownersEmployeeId: async () => {
      const owner = await owners.readOwner(orm);
      return owner ? employeeIdOfUser(owner.userId) : null;
    },
  };
}
