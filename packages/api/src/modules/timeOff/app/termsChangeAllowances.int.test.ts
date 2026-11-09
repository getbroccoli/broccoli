import {
  calendarDate,
  expect,
  giveTermsPolicies,
  OWNER,
  readAllowances,
  termsService,
  test,
  timeOffPolicyService,
  timeOffService,
  workingPatternService,
} from "#test/support";
import { createLogger } from "../../../core/logger";
import { allowanceEventHandlers } from "./allowanceEventHandlers";

test("a December terms move splits Annual leave between the old and new terms and records its cause", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await termsService(orm, { today: "2026-11-09" }).createTerms(OWNER, {
    name: "Scotland",
    bankHolidayCalendar: "scotland",
  });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-09",
  });
  const timeOff = timeOffService(orm, { today: "2026-11-09" });
  const { timeOffTypes } = await timeOff.listTimeOffTypes(OWNER);
  const annual = timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  await timeOffPolicyService(orm, { today: "2026-11-09" }).createPolicy(OWNER, {
    termsId: scotland.id,
    timeOffTypeId: annual.id,
    startDate: "2026-01-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 28,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });
  const handlers = allowanceEventHandlers({ timeOff, transact, logger: createLogger("silent") });
  expect(await readAllowances(orm, employee.id)).toMatchObject([
    { leaveYearStart: "2026-01-01", total: 20 },
  ]);

  await workingPatternService(orm, { today: "2026-11-09" }).changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland.id,
    startDate: "2026-12-01",
  });
  await handlers["employees.terms_changed"]!({
    employeeIds: [employee.id],
    from: calendarDate("2026-12-01"),
  });

  const [allowance] = await readAllowances(orm, employee.id);
  // 334 days at 20 and 31 at 28 gives 20.679452 days, rounded up once to a half day.
  expect(allowance).toMatchObject({
    leaveYearStart: "2026-01-01",
    leaveYearEnd: "2026-12-31",
    total: 21,
  });
  expect(allowance!.lines).toContainEqual(
    expect.objectContaining({ causeKind: "terms_changed", causeRef: "2026-12-01" }),
  );
});
