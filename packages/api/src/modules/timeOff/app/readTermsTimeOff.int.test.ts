import { eq } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { timeOffPolicyVersions } from "../db";

test("lists every type in order with no versions for each terms without policies", async ({
  orm,
  seed,
}) => {
  const defaultId = await seed.defaultTermsId();
  const otherId = await seed.terms("Scotland");
  await seedTimeOffType(orm, "Moving day");
  const service = timeOffService(orm, { today: "2026-11-06" });

  const result = await service.readTermsTimeOff(ADMIN, [defaultId, otherId]);

  expect(new Set(result.keys())).toEqual(new Set([defaultId, otherId]));
  for (const id of [defaultId, otherId]) {
    expect(
      result.get(id)!.map(({ timeOffType, versions }) => ({ name: timeOffType.name, versions })),
    ).toEqual([
      { name: "Annual leave", versions: [] },
      { name: "Sickness", versions: [] },
      { name: "Family leave", versions: [] },
      { name: "Other", versions: [] },
      { name: "Moving day", versions: [] },
    ]);
  }
});

test("reads a terms' current and planned policy versions in date order, leaving past versions out", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  const otherId = await seed.terms("Scotland");
  await giveTermsPolicies(orm, transact, { termsId, policies: [{ key: "uk_statutory_minimum" }] });
  const [past] = await orm.select().from(timeOffPolicyVersions);
  await orm
    .update(timeOffPolicyVersions)
    .set({ endDate: calendarDate("2026-11-05") })
    .where(eq(timeOffPolicyVersions.id, past!.id));
  await orm.insert(timeOffPolicyVersions).values([
    {
      timeOffPolicyId: past!.timeOffPolicyId,
      startDate: calendarDate("2027-01-01"),
      balance: "no_balance",
    },
    {
      timeOffPolicyId: past!.timeOffPolicyId,
      startDate: calendarDate("2026-11-06"),
      endDate: calendarDate("2026-12-31"),
      balance: "unlimited_balance",
      leaveYearStart: "leave_year_from_fixed_date",
      leaveYearStartMonth: 1,
      leaveYearStartDay: 1,
    },
  ]);
  const service = timeOffService(orm, { today: "2026-11-06" });

  const result = await service.readTermsTimeOff(ADMIN, [termsId, otherId]);

  expect(
    result.get(termsId)!.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!
      .versions,
  ).toMatchObject([
    { startDate: "2026-11-06", endDate: "2026-12-31", balance: "unlimited_balance" },
    { startDate: "2027-01-01", endDate: null, balance: "no_balance" },
  ]);
  expect(result.get(otherId)!.map(({ versions }) => versions)).toEqual([[], [], [], []]);
});

test("refuses an employee reading terms' time off", async ({ orm, seed }) => {
  const id = await seed.defaultTermsId();
  const service = timeOffService(orm, { today: "2026-11-06" });

  await expect(service.readTermsTimeOff(EMPLOYEE, [id])).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
