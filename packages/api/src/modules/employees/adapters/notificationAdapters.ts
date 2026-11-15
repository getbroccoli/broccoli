import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { NotificationPeoplePort } from "../../../core/notifications";
import type { ReadEmployeeNames } from "../../../core/tasks";
import { employeeRepository } from "../db";

/** Notifications read whom they email through this: a work email, and whether they joined. */
export function createNotificationPeopleAdapter({
  orm,
}: Pick<ModuleDependencies, "orm">): NotificationPeoplePort & {
  readEmployeeNames: ReadEmployeeNames;
} {
  const employees = employeeRepository(orm);
  return {
    async readRecipient(employeeId) {
      const employee = await employees.findById(employeeId);
      return employee && { email: employee.email, joined: employee.userId !== null };
    },
    async readEmployeeNames(ids) {
      const found = ids.length ? await employees.findByIds(ids) : [];
      return new Map(found.map(({ id, firstName, lastName }) => [id, `${firstName} ${lastName}`]));
    },
  };
}
