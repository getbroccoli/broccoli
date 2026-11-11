import {
  ADMIN,
  calendarDate,
  EMPLOYEE,
  expect,
  giveDefaultTermsStatutoryMinimum,
  giveTermsPolicies,
  seedTimeOff,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { timeOffPolicyAssignments, timeOffTypes } from "../db";

test("lists the four seeded types in order with their icons and colours", async ({ orm }) => {
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(
    result.timeOffTypes.map(({ timeOffType }) => [
      timeOffType.name,
      timeOffType.icon,
      timeOffType.colour,
    ]),
  ).toEqual([
    ["Annual leave", "sun", "green"],
    ["Sickness", "thermometer", "coral"],
    ["Family leave", "baby", "pink"],
    ["Other", "confetti", "yellow"],
  ]);
});

test("lists a company's own type after the seeded ones, with no icon or colour", async ({
  orm,
}) => {
  await seedTimeOffPolicy(orm, { name: "Moving day", balance: "balance_from_allowance" });
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(result.timeOffTypes.at(-1)).toMatchObject({
    timeOffType: { name: "Moving day", icon: null, colour: null },
  });
});

test("reads how a type counts from its policies", async ({ orm, seed, transact }) => {
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_statutory_minimum" }, { recordOnly: "sickness" }],
  });
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(
    result.timeOffTypes.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave"),
  ).toMatchObject({ balance: "balance_from_allowance" });
  expect(
    result.timeOffTypes.find(({ timeOffType }) => timeOffType.typeKey === "sickness"),
  ).toMatchObject({ balance: "no_balance" });
});

test("uses the latest version's balance kind when a terms' policy has ended", async ({
  orm,
  seed,
  transact,
}) => {
  const type = await seedTimeOffType(orm, "Moving day");
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [
      {
        timeOffTypeId: type.id,
        version: {
          balance: "unlimited_balance",
          bankHolidays: null,
          leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
          rules: [],
        },
      },
    ],
  });
  await orm.update(timeOffPolicyAssignments).set({ endDate: calendarDate("2026-10-31") });
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(result.timeOffTypes.find(({ timeOffType }) => timeOffType.id === type.id)).toMatchObject({
    balance: "unlimited_balance",
  });
});

test("takes the oldest policy's balance kind on a tie", async ({ orm }) => {
  const oldest = await seedTimeOffPolicy(orm, {
    name: "Moving day",
    balance: "balance_from_allowance",
  });
  await seedTimeOffPolicy(orm, {
    name: "Unlimited moving days",
    timeOffTypeId: oldest.timeOffTypeId,
    balance: "unlimited_balance",
  });
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(
    result.timeOffTypes.find(({ timeOffType }) => timeOffType.id === oldest.timeOffTypeId),
  ).toMatchObject({ balance: "balance_from_allowance" });
});

test("returns no balance kind for a type without a policy", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Moving day");
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(result.timeOffTypes.find(({ timeOffType }) => timeOffType.id === type.id)).toMatchObject({
    balance: null,
    daysTakenThisYear: 0,
  });
});

test("sums the days everyone took this calendar year", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const colleague = await seed.employee();
  const service = timeOffService(orm, { today: "2026-11-05" });
  const annualLeave = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "annual_leave",
  )!;
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: annualLeave.id,
    status: "approved",
    days: [
      { date: "2026-03-02", dayPart: "full_day" },
      { date: "2026-03-03", dayPart: "full_day" },
    ],
  });
  await seedTimeOff(orm, {
    employeeId: colleague.id,
    timeOffTypeId: annualLeave.id,
    status: "pending_approval",
    days: [{ date: "2026-04-01", dayPart: "morning" }],
  });
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: annualLeave.id,
    status: "approved",
    days: [{ date: "2025-03-03", dayPart: "full_day" }],
  });
  await seedTimeOff(orm, {
    employeeId: colleague.id,
    timeOffTypeId: annualLeave.id,
    status: "declined",
    days: [{ date: "2026-04-02", dayPart: "full_day" }],
  });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(
    result.timeOffTypes.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave"),
  ).toMatchObject({ daysTakenThisYear: 2.5 });
});

test("counts the people who have a time off type today", async ({ orm, seed, transact }) => {
  await seed.employee({ startDate: "2025-01-01" });
  await seed.employee({ startDate: "2025-01-01" });
  const withoutTerms = await seed.employee({ startDate: "2025-01-01" });
  await seed.leaveTerms(withoutTerms.id);
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(result.peopleWithTimeOff).toBe(2);
});

test("refuses a caller who cannot manage the workspace", async ({ orm }) => {
  const service = timeOffService(orm, { today: "2026-11-05" });

  await expect(service.listTimeOffTypes(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
