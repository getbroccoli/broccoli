import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { employeeRepository } from "../db";
import { parseUuid } from "../../../utils";

/** The fields an employee update may change, by their input names; `avatar` arrives with the photo upload. */
const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "startDate",
  "managerId",
  "avatar",
];

/**
 * The employee as a record type that keeps history: who may read its history, the id history
 * keeps, and how `RecordChange.record` loads employees. `recordHistory` and `Employee.history`
 * both read through it, so one rule covers both.
 */
export function employeeRecordType(orm: Orm): RecordTypeRegistration {
  return {
    graphqlType: "Employee",
    // Everyone who may read every employee reads every history; a deleted record keeps its own.
    requireHistoryAccess: (ctx) => ctx.requireEveryRecord("employee", "read"),
    canonicalId: parseUuid,
    loadRecords: async (ctx, ids) => {
      ctx.requireEveryRecord("employee", "read");
      const employees = await employeeRepository(orm).findByIds(ids);
      return new Map(employees.map((employee) => [employee.id, employee]));
    },
    permissions: { object: "employee", editableFields: EDITABLE_FIELDS },
  };
}
