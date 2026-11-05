import {
  ADMIN,
  EMPLOYEE,
  expect,
  linkStatutoryMinimumToDefaultTerms,
  seedTimeOff,
  seedTimeOffPolicy,
  test,
  timeOffService,
} from "#test/support";

import { timeOffTypes } from "../db";

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

test("each type lists its policies", async ({ orm }) => {
  const service = timeOffService(orm, { today: "2026-11-05" });
  const policies = await service.listPolicies(ADMIN, orm);

  const result = await service.listTimeOffTypes(ADMIN);

  for (const { timeOffType, policies: listed } of result.timeOffTypes) {
    expect(listed.map(({ id }) => id).sort()).toEqual(
      policies
        .filter(({ typeKey }) => typeKey === timeOffType.typeKey)
        .map(({ id }) => id)
        .sort(),
    );
  }
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
  await linkStatutoryMinimumToDefaultTerms(orm, seed, transact);
  const service = timeOffService(orm, { today: "2026-11-05" });

  const result = await service.listTimeOffTypes(ADMIN);

  expect(result.peopleWithTimeOff).toBe(2);
});

test("refuses a caller who cannot manage the workspace", async ({ orm }) => {
  const service = timeOffService(orm, { today: "2026-11-05" });

  await expect(service.listTimeOffTypes(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
