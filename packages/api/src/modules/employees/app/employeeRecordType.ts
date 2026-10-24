import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { employeeRepository } from "../db";
import { parseUuid } from "../../../utils";

declare module "../../../core/records" {
  interface RecordTypes {
    employee: true;
  }
}

/**
 * The employee as a record type that keeps history: who may read its history, the id history
 * keeps, and how `RecordChange.record` loads employees. `recordHistory` and `Employee.history`
 * both read through it, so one rule covers both.
 */
export function employeeRecordType(orm: Orm): RecordTypeRegistration {
  return {
    graphqlType: "Employee",
    requireHistoryAccess: (ctx) => ctx.requireOwnerOrSystem(),
    canonicalId: parseUuid,
    loadRecords: async (ctx, ids) => {
      ctx.requireOwnerOrSystem();
      const employees = await employeeRepository(orm).findByIds(ids);
      return new Map(employees.map((employee) => [employee.id, employee]));
    },
  };
}
