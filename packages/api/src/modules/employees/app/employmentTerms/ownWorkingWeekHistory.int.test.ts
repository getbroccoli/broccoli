import { employeeServices, expect, OWNER, test, workingPatternService } from "#test/support";
import { transactor } from "../../../../core/db";
import { createEventBus, type DomainEvents } from "../../../../core/events";
import { createLogger } from "../../../../core/logger";

test("records giving a person their own week as one employee history line", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges.map(({ node }) => node)).toMatchObject([
    {
      recordType: "employee",
      recordId: employee.id,
      operation: "UPDATED",
      changes: [{ field: "workingWeek" }],
    },
  ]);
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ week: null, startDate: "2026-12-01" });
  expect(JSON.parse(change.newValue!)).toEqual({ week: fourDays, startDate: "2026-12-01" });
});

test("records the previous and new own weeks in one history line", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...sevenHours,
  });

  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(2);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [{ field: "workingWeek" }],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ week: sevenHours, startDate: "2026-12-01" });
  expect(JSON.parse(change.newValue!)).toEqual({ week: fourDays, startDate: "2026-12-01" });
});

test("records returning to the terms' week in one history line", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...fourDays,
  });

  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2027-01-01" });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(2);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [{ field: "workingWeek" }],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ week: fourDays, startDate: "2027-01-01" });
  expect(JSON.parse(change.newValue!)).toEqual({ week: null, startDate: "2027-01-01" });
});

test("records cancelling a return with its cancelled value and no new value", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...fourDays,
  });
  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2027-01-01" });

  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2027-01-01",
  });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});
  expect(page.edges).toHaveLength(3);
  expect(page.edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [{ field: "workingWeek" }],
  });
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ week: null, startDate: "2027-01-01" });
  expect(change.newValue).toBeNull();
});

test("publishes the person and date for each committed own-week change", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const events: DomainEvents["employees.working_pattern_changed"][] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "employees.working_pattern_changed": (event) => {
      events.push(event);
      return Promise.resolve();
    },
  });
  const service = workingPatternService(orm, {
    today: "2026-11-09",
    transact: transactor(orm, eventBus),
  });

  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...sevenHours,
  });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });
  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2027-01-01" });
  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2027-01-01",
  });

  expect(events).toEqual([
    { employeeIds: [employee.id], from: "2026-03-01" },
    { employeeIds: [employee.id], from: "2026-12-01" },
    { employeeIds: [employee.id], from: "2027-01-01" },
    { employeeIds: [employee.id], from: "2027-01-01" },
  ]);
});

const fourDays = {
  minutes: [480, 480, 480, 480, 0, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
const sevenHours = {
  minutes: [420, 420, 420, 420, 420, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
