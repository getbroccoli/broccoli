import {
  expect,
  OWNER,
  test,
  workingPatternService,
  timeOffPolicyService,
  seedTermsWeek,
} from "#test/support";
import { type Orm, transactor } from "../../../../core/db";
import { createEventBus, type DomainEvents } from "../../../../core/events";
import { createLogger } from "../../../../core/logger";

test("publishing a working week publishes its affected employees and earliest date", async ({
  orm,
  seed,
}) => {
  const first = await seed.employee({ startDate: "2025-01-01" });
  const second = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  const { events, transact } = workingPatternChangedEvents(orm);
  const draft = await workingPatternService(orm, { transact }).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  await timeOffPolicyService(orm, { transact }).publishTerms(OWNER, {
    termsId,
    versions: [{ id: draft.id, revision: draft.revision }],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  expect(events).toHaveLength(1);
  expect(events[0]!.employeeIds.toSorted()).toEqual([first.id, second.id].toSorted());
  expect(events[0]!.from).toBe("2026-07-01");
});

test("saving and discarding an unpublished week publish no working pattern event", async ({
  orm,
  seed,
}) => {
  const { events, transact } = workingPatternChangedEvents(orm);
  const patterns = workingPatternService(orm, { transact });
  const draft = await patterns.saveWorkingPattern(OWNER, {
    termsId: await seed.defaultTermsId(),
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  await patterns.discardWorkingPattern(OWNER, { versionId: draft.id });

  expect(events).toEqual([]);
});

test("publishing only a calendar change publishes affected employees and its date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  const { events, transact } = workingPatternChangedEvents(orm);
  const draft = await workingPatternService(orm, { transact }).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  await timeOffPolicyService(orm, { transact }).publishTerms(OWNER, {
    termsId,
    versions: [{ id: draft.id, revision: draft.revision }],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  expect(events).toEqual([{ employeeIds: [employee.id], from: "2026-07-01" }]);
});

test("cancelling a planned week publishes reached people and its start date", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.terms("Scotland");
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(employee.id, termsId);
  const planned = await seedTermsWeek(orm, { termsId, startDate: "2026-12-01" });
  const { events, transact } = workingPatternChangedEvents(orm);

  await workingPatternService(orm, { transact }).cancelWorkingPatternChange(OWNER, {
    assignmentId: planned.assignmentId,
  });

  expect(events).toEqual([{ employeeIds: [employee.id], from: "2026-12-01" }]);
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
