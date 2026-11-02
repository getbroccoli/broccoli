import { expect, OWNER, test, workingPatternService } from "#test/support";
import { type Orm, transactor } from "../../../core/db";
import { createEventBus, type DomainEvents } from "../../../core/events";
import { createLogger } from "../../../core/logger";

test("a Standard change publishes its affected employees and earliest changed date", async ({
  orm,
  seed,
}) => {
  const first = await seed.employee();
  const second = await seed.employee();
  const { events, transact } = workingPatternChangedEvents(orm);
  const patterns = workingPatternService(orm, { transact });
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;

  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  expect(events).toHaveLength(1);
  expect(events[0]!.employeeIds).toEqual(expect.arrayContaining([first.id, second.id]));
  expect(events[0]!.from).toBe("2026-09-01");
});

test("creating, renaming and deleting an unused pattern publish no working pattern event", async ({
  orm,
}) => {
  const { events, transact } = workingPatternChangedEvents(orm);
  const patterns = workingPatternService(orm, { transact });

  const pattern = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.renamePattern(OWNER, { workingPatternId: pattern.id, name: "Monday only" });
  await patterns.deletePattern(OWNER, { workingPatternId: pattern.id });

  expect(events).toEqual([]);
});

test("assigning a pattern publishes the employee and assignment start date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  await seed.leaveGroups(employee.id);
  const { events, transact } = workingPatternChangedEvents(orm);
  const patterns = workingPatternService(orm, { transact });
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;

  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
  });

  expect(events).toHaveLength(1);
  expect(events[0]!.employeeIds).toEqual(expect.arrayContaining([employee.id]));
  expect(events[0]!.from).toBe("2026-09-01");
});

function workingPatternChangedEvents(orm: Orm) {
  const events: DomainEvents["employees.working_pattern_changed"][] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "employees.working_pattern_changed": (event) => {
      events.push(event);
      return Promise.resolve();
    },
  });
  return { transact: transactor(orm, eventBus), events };
}
