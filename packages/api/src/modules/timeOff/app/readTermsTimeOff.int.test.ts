import {
  ADMIN,
  EMPLOYEE,
  expect,
  seedTermsPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { timeOffPolicyRepository } from "../db";
import { RECORD_ONLY_POLICY, STANDARD_LEAVE_POLICIES } from "../domain";

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
}) => {
  const termsId = await seed.defaultTermsId();
  const otherId = await seed.terms("Scotland");
  const [type] = (await timeOffPolicyRepository(orm).findAllTypes()).filter(
    ({ typeKey }) => typeKey === "annual_leave",
  );
  await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type!.id,
    version: STANDARD_LEAVE_POLICIES.uk_statutory_minimum,
    startDate: "2026-01-01",
    endDate: "2026-11-05",
  });
  const planned = await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type!.id,
    version: RECORD_ONLY_POLICY,
    startDate: "2027-01-01",
  });
  const current = await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: type!.id,
    version: {
      balance: "unlimited_balance",
      bankHolidays: null,
      leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
      rules: [],
    },
    startDate: "2026-11-06",
    endDate: "2026-12-31",
  });
  const service = timeOffService(orm, { today: "2026-11-06" });

  const result = await service.readTermsTimeOff(ADMIN, [termsId, otherId]);

  expect(
    result.get(termsId)!.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!
      .versions,
  ).toMatchObject([
    {
      id: current.assignmentId,
      startDate: "2026-11-06",
      endDate: "2026-12-31",
      version: { id: current.versionId, balance: "unlimited_balance" },
    },
    {
      id: planned.assignmentId,
      startDate: "2027-01-01",
      endDate: null,
      version: { id: planned.versionId, balance: "no_balance" },
    },
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
