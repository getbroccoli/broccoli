import { ADMIN, deleteAllEmployees, expect, OWNER, test, timeOffService } from "#test/support";

test("starting over removes added types and restores standard types with defaults that do not count", async ({
  orm,
  transact,
}) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);
  const annualLeave = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  expect(before.timeOffTypes.map(({ timeOffType }) => timeOffType.defaultRules)).toEqual([
    noBalance,
    noBalance,
    noBalance,
    noBalance,
  ]);
  await service.createType(ADMIN, studyLeave);
  await service.changeType(ADMIN, {
    ...studyLeave,
    id: annualLeave.id,
    name: "Paid leave",
    icon: "airplane",
    colour: "blue",
    private: true,
  });

  await transact((tx) => deleteAllEmployees(orm)(OWNER, tx));

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("starting over restores standard names that other standard types took", async ({
  orm,
  transact,
}) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);
  const annualLeave = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  const other = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "other",
  )!.timeOffType;
  await service.changeType(ADMIN, {
    id: annualLeave.id,
    name: "Holiday",
    icon: "sun",
    colour: "green",
    private: false,
    defaultRules: annualLeave.defaultRules,
  });
  await service.changeType(ADMIN, {
    id: other.id,
    name: "Annual leave",
    icon: "confetti",
    colour: "yellow",
    private: false,
    defaultRules: other.defaultRules,
  });

  await transact((tx) => deleteAllEmployees(orm)(OWNER, tx));

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

const studyLeave = {
  name: "Study leave",
  icon: "graduation_cap",
  colour: "blue",
  private: false,
  defaultRules: {
    balance: "balance_from_allowance",
    entitlementDays: 12.5,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  },
} as const;

const noBalance = { balance: "no_balance", entitlementDays: null, bankHolidays: null } as const;
