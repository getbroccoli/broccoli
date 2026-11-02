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
 * The employee as a record type that keeps history: the id history keeps, and how core finds
 * employees and their subjects, each employee being their own. `recordHistory` and
 * `Employee.history` both read through it, so one rule covers both.
 */
export function employeeRecordType(orm: Orm): RecordTypeRegistration {
  return {
    graphqlType: "Employee",
    canonicalId: parseUuid,
    subjectsOf: async (ids) => {
      const employees = await employeeRepository(orm).findByIds(ids);
      return new Map(employees.map(({ id }) => [id, id]));
    },
    loadRecords: async (ids) => {
      const employees = await employeeRepository(orm).findByIds(ids);
      return new Map(employees.map((employee) => [employee.id, employee]));
    },
    permissions: { object: "employee", editableFields: EDITABLE_FIELDS },
    references: { manager: "employee" },
  };
}

/**
 * A person's own working pattern changes as a record type: its record is the employee, so core
 * shows these lines only to callers who may read that person's working pattern.
 */
export function workingPatternRecordType(orm: Orm): RecordTypeRegistration {
  return {
    ...employeeRecordType(orm),
    permissions: { object: "working_pattern", editableFields: [] },
    references: {},
  };
}
