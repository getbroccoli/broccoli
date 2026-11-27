import { sql } from "drizzle-orm";

import {
  calendarDate,
  expect,
  expectBlockedBy,
  giveTermsPolicies,
  OWNER,
  ownTimeOffRulesService,
  readAllowances,
  readTermsPolicies,
  seedTimeOff,
  test,
  type TestSeed,
  testTransactor,
  timeOffPolicyService,
  timeOffService,
  workingPatternService,
} from "#test/support";
import { ApplicationError } from "../../../core/applicationError";
import {
  type BeforeCommitHandler,
  createBeforeCommitBus,
  type Orm,
  ormOf,
  transactor,
  type Tx,
} from "../../../core/db";
import { createEventBus } from "../../../core/events";
import { createLogger } from "../../../core/logger";
import { createEmployeeReadService } from "../../employees";
import { allowanceEventHandlers } from "./allowanceEventHandlers";
import { createOwnTimeOffRulesService } from "./ownTimeOffRulesService";
import { refuseBookingsWithoutRules } from "./termsChangeBookings";

test("refuses No terms and names the person, type and booked dates that would lose their rules", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee(aishaBegum);
  const timeOffTypeId = await giveAnnualLeave(orm, await seed.defaultTermsId());
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId,
    status: "approved",
    days: ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"].map((date) => ({
      date,
      dayPart: "full_day",
    })),
  });

  await expect(
    termsChanges(orm).changeTerms(OWNER, { employeeIds: [employee.id], termsId: null, startDate }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Aisha Begum has Annual leave booked on 4–8 Jan.",
  });
});

test("allows No terms when the person's own rules cover the booked day", async ({ orm, seed }) => {
  const { employeeId } = await bookedOwnAndInheritedLeave(orm, seed);

  const result = await termsChanges(orm).changeTerms(OWNER, {
    employeeIds: [employeeId],
    termsId: null,
    startDate,
  });

  expect(result).toEqual({ moved: [{ employeeId, startDate }], skipped: [] });
});

test("refuses Use terms’ rules when a concurrent move to No terms keeps a booking covered by own rules", async ({
  orm,
  seed,
}) => {
  const input = await bookedOwnAndInheritedLeave(orm, seed);
  const move = { employeeIds: [input.employeeId], termsId: null, startDate };

  await expectConcurrentBookingConflict(
    orm,
    (pause) => termsChanges(orm, pause).changeTerms(OWNER, move),
    () => ownTimeOffRulesService(orm, { today }).useTermsRules(OWNER, input),
  );
});

test("refuses No terms without a deadlock when a concurrent return to inherited rules keeps a booking covered", async ({
  orm,
  seed,
  transact,
}) => {
  const input = await bookedOwnAndInheritedLeave(orm, seed);
  const move = { employeeIds: [input.employeeId], termsId: null, startDate };
  const timeOff = timeOffService(orm, { today });

  await expectConcurrentBookingConflict(
    orm,
    (pause) =>
      createOwnTimeOffRulesService({
        orm,
        transact,
        logger: createLogger("silent"),
        today: () => calendarDate(today),
        timeOff: {
          // The return has checked inherited cover. Resume its real allowance calculation once the move waits.
          async ensureAllowances(ctx, tx, change) {
            await pause(tx);
            return timeOff.ensureAllowances(ctx, tx, change);
          },
        },
      }).useTermsRules(OWNER, input),
    () => termsChanges(orm).changeTerms(OWNER, move),
  );
});

test("refuses publishing a stop that would uncover an incoming employee's booked day", async ({
  orm,
  seed,
}) => {
  const { employeeId, timeOffTypeId } = await bookedInheritedLeave(orm, seed);
  const termsId = await seed.terms("Scotland");
  await giveAnnualLeave(orm, termsId);
  const policies = timeOffPolicyService(orm, { today });
  const stop = await policies.saveTimeOffStop(OWNER, { termsId, timeOffTypeId });
  const move = { employeeIds: [employeeId], termsId, startDate };
  const publish = { termsId, versions: [stop], owners: [{ termsId }], startDate };

  await expectConcurrentBookingConflict(
    orm,
    (pause) => termsChanges(orm, pause).changeTerms(OWNER, move),
    () => policies.publishTerms(OWNER, publish),
  );

  const rules = await timeOffService(orm, { today }).readPersonTimeOff(OWNER, {
    employeeIds: [employeeId],
    from: bookedDay,
  });
  expect(
    rules.get(employeeId)?.find((row) => row.timeOffType.id === timeOffTypeId)?.versions,
  ).toMatchObject([
    {
      startDate: bookedDay,
      source: "from_their_terms",
      version: { balance: "balance_from_allowance" },
    },
  ]);
});

test("refuses a move to other terms that do not offer a pending booking's type", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee(benCarter);
  const timeOffTypeId = await giveAnnualLeave(orm, await seed.defaultTermsId());
  const scotland = await seed.terms("Scotland");
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId,
    status: "requested",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });

  await expect(
    termsChanges(orm).changeTerms(OWNER, {
      employeeIds: [employee.id],
      termsId: scotland,
      startDate,
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Ben Carter has Annual leave booked on 4 Jan.",
  });
});

test("a refused bulk move reports every lost booking and leaves everyone's terms in place", async ({
  orm,
  seed,
  transact,
}) => {
  const ben = await seed.employee(benCarter);
  const aisha = await seed.employee(aishaBegum);
  const unbooked = await seed.employee({ startDate: "2025-01-01" });
  const england = await seed.defaultTermsId();
  const annual = await giveAnnualLeave(orm, england);
  await giveTermsPolicies(orm, transact, {
    termsId: england,
    policies: [{ recordOnly: "family_leave" }],
  });
  const family = (await readTermsPolicies(orm, england)).find(
    (policy) => policy.typeKey === "family_leave",
  )!;
  await seedTimeOff(orm, {
    employeeId: ben.id,
    timeOffTypeId: family.timeOffTypeId,
    status: "approved",
    days: [{ date: "2027-02-02", dayPart: "full_day" }],
  });
  await seedTimeOff(orm, {
    employeeId: aisha.id,
    timeOffTypeId: family.timeOffTypeId,
    status: "approved",
    days: [{ date: "2027-01-05", dayPart: "full_day" }],
  });
  await seedTimeOff(orm, {
    employeeId: aisha.id,
    timeOffTypeId: annual,
    status: "requested",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const service = termsChanges(orm);
  const employeeIds = [unbooked.id, ben.id, aisha.id];
  const before = await service.readEmploymentTerms(OWNER, { employeeIds });

  await expect(
    service.changeTerms(OWNER, { employeeIds, termsId: null, startDate }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message:
      "Aisha Begum has Annual leave booked on 4 Jan. Aisha Begum has Family leave booked on 5 Jan. Ben Carter has Family leave booked on 2 Feb.",
  });
  expect(await service.readEmploymentTerms(OWNER, { employeeIds })).toEqual(before);
});

test("No terms from December prorates the inherited allowance through November", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveAnnualLeave(orm, await seed.defaultTermsId());

  await termsChanges(orm).changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: null,
    startDate: "2026-12-01",
  });

  const [allowance] = await readAllowances(orm, employee.id);
  expect(allowance!.lines).toContainEqual(
    expect.objectContaining({
      rule: "yearly_entitlement",
      amount: -1.69863,
      effectiveDate: "2026-12-01",
    }),
  );
});

const benCarter = { firstName: "Ben", lastName: "Carter", startDate: "2025-01-01" };
const aishaBegum = { firstName: "Aisha", lastName: "Begum", startDate: "2025-01-01" };
const today = "2026-11-09";
const startDate = "2027-01-01";
const bookedDay = calendarDate("2027-01-04");

async function bookedOwnAndInheritedLeave(orm: Orm, seed: TestSeed) {
  const input = { ...(await bookedInheritedLeave(orm, seed)), startDate };
  await ownTimeOffRulesService(orm, { today }).setOwnRules(OWNER, {
    ...input,
    rules: { balance: "unlimited_balance" },
  });
  return input;
}

async function bookedInheritedLeave(orm: Orm, seed: TestSeed) {
  const { id: employeeId } = await seed.employee({ startDate: "2025-01-01" });
  const timeOffTypeId = await giveAnnualLeave(orm, await seed.defaultTermsId());
  await seedTimeOff(orm, {
    employeeId,
    timeOffTypeId,
    status: "approved",
    days: [{ date: bookedDay, dayPart: "full_day" }],
  });
  return { employeeId, timeOffTypeId };
}

async function expectConcurrentBookingConflict(
  orm: Orm,
  first: (pause: (tx: Tx) => Promise<void>) => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const checked = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const firstChange = first(async (tx) => {
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    checked.resolve(rows[0]!.pid);
    await release.promise;
  });
  void firstChange.catch(checked.reject);
  const blockingPid = await checked.promise;
  const secondChange = second();
  const blocked = expectBlockedBy(orm, blockingPid).finally(release.resolve);
  await Promise.allSettled([firstChange, secondChange, blocked]);

  await firstChange;
  await expect(secondChange).rejects.toBeInstanceOf(ApplicationError);
  await expect(secondChange).rejects.toMatchObject({ code: "CONFLICT" });
  await blocked;
}

async function giveAnnualLeave(orm: Orm, termsId: string) {
  await giveTermsPolicies(orm, testTransactor(orm), {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today,
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  return annual!.timeOffTypeId;
}

function termsChanges(orm: Orm, afterBookingCheck?: BeforeCommitHandler) {
  const logger = createLogger("silent");
  const beforeCommit = createBeforeCommitBus();
  beforeCommit.subscribe(
    refuseBookingsWithoutRules({ employeeReads: createEmployeeReadService({ orm }), logger }),
  );
  if (afterBookingCheck) beforeCommit.subscribe(afterBookingCheck);
  const events = createEventBus(logger);
  const transact = transactor(orm, events, beforeCommit);
  events.subscribe(
    allowanceEventHandlers({ timeOff: timeOffService(orm, { today }), transact, logger }),
  );
  return workingPatternService(orm, { today, transact });
}
