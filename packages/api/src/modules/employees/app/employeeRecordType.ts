import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { employeeRepository, employmentRepository } from "../db";
import { parseUuid } from "../../../utils";

/** The fields an employee update may change, by their input names; `avatar` arrives with the photo upload. */
const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "locationId",
  "startDate",
  "managerId",
  "avatar",
];

/**
 * The employee as a record type that keeps history: the id history keeps, and how core finds
 * employees and their subjects, each employee being their own. `recordHistory` and
 * `Employee.history` both read through it, so one rule covers both. A process may run on an
 * employee, starting on their first employment's `startDate`.
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
    processes: {
      readSubjects: async (tx, ids) => {
        const employees = await employeeRepository(tx).findByIds(
          ids.flatMap((id) => parseUuid(id) ?? []),
        );
        return new Map(employees.map(({ id }) => [id, id]));
      },
      dateFields: ["startDate"],
      findByDateBetween: (tx, { from, until }) =>
        employmentRepository(tx).findStartingBetween(from, until),
    },
  };
}
