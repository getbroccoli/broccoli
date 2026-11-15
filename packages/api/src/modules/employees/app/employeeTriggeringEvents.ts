import type { DomainEvents } from "../../../core/events";

/** Employees' events that may start a process: one run per employee added. */
export const EMPLOYEE_TRIGGERING_EVENTS = {
  "employees.added": {
    recordType: "employee",
    recordIds: ({ employeeIds }: DomainEvents["employees.added"]) => employeeIds,
    payloadFor: (_: DomainEvents["employees.added"], employeeId: string) => ({
      employeeIds: [employeeId],
    }),
  },
};
