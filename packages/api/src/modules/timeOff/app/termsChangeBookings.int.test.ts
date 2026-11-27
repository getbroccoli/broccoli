import {
  expect,
  giveTermsPolicies,
  OWNER,
  ownTimeOffRulesService,
  readAllowances,
  readTermsPolicies,
  seedTimeOff,
  test,
  testTransactor,
  timeOffService,
  workingPatternService,
} from "#test/support";
import { createBeforeCommitBus, type Orm, transactor } from "../../../core/db";
import { createEventBus } from "../../../core/events";
import { createLogger } from "../../../core/logger";
import { createEmployeeReadService } from "../../employees";
import { allowanceEventHandlers } from "./allowanceEventHandlers";
import { refuseBookingsWithoutRules } from "./termsChangeBookings";

test("refuses No terms and names the person, type and booked dates that would lose their rules", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({
    firstName: "Aisha",
    lastName: "Begum",
    startDate: "2025-01-01",
  });
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
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const timeOffTypeId = await giveAnnualLeave(orm, await seed.defaultTermsId());
  const person = { employeeId: employee.id, timeOffTypeId };
  await ownTimeOffRulesService(orm, { today }).setOwnRules(OWNER, {
    ...person,
    startDate,
    rules: { balance: "unlimited_balance" },
  });
  await seedTimeOff(orm, {
    ...person,
    status: "approved",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });

  const result = await termsChanges(orm).changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: null,
    startDate,
  });

  expect(result).toEqual({ moved: [{ employeeId: employee.id, startDate }], skipped: [] });
});

test("refuses a move to other terms that do not offer a pending booking's type", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({
    firstName: "Ben",
    lastName: "Carter",
    startDate: "2025-01-01",
  });
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
  const ben = await seed.employee({
    firstName: "Ben",
    lastName: "Carter",
    startDate: "2025-01-01",
  });
  const aisha = await seed.employee({
    firstName: "Aisha",
    lastName: "Begum",
    startDate: "2025-01-01",
  });
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

const today = "2026-11-09";
const startDate = "2027-01-01";

async function giveAnnualLeave(orm: Orm, termsId: string) {
  await giveTermsPolicies(orm, testTransactor(orm), {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today,
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  return annual!.timeOffTypeId;
}

function termsChanges(orm: Orm) {
  const logger = createLogger("silent");
  const beforeCommit = createBeforeCommitBus();
  beforeCommit.subscribe(
    refuseBookingsWithoutRules({ employeeReads: createEmployeeReadService({ orm }), logger }),
  );
  const events = createEventBus(logger);
  const transact = transactor(orm, events, beforeCommit);
  events.subscribe(
    allowanceEventHandlers({ timeOff: timeOffService(orm, { today }), transact, logger }),
  );
  return workingPatternService(orm, { today, transact });
}
