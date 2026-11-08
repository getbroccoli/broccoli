import {
  ADMIN,
  deleteAllEmployees,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  OWNER,
  seedTimeOff,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

import { STANDARD_LEAVE_POLICIES } from "../domain";

test("deletes an added type and its rules from every terms", async ({ orm, seed, transact }) => {
  const type = await seedTimeOffType(orm, "Study leave");
  const termsIds = [await seed.defaultTermsId(), await seed.terms("Scotland")];
  await seed.employee({ startDate: "2025-01-01" });
  for (const termsId of termsIds) {
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ timeOffTypeId: type.id, version: STANDARD_LEAVE_POLICIES.uk_statutory_minimum }],
    });
  }
  const service = timeOffService(orm);
  const before = await service.readTermsTimeOff(ADMIN, termsIds);
  for (const termsId of termsIds) {
    expect(
      before.get(termsId)!.find(({ timeOffType }) => timeOffType.id === type.id)!.versions,
    ).toHaveLength(1);
  }
  expect((await service.listTimeOffTypes(ADMIN)).peopleWithTimeOff).toBe(1);

  await service.deleteType(ADMIN, { id: type.id });

  const listed = await service.listTimeOffTypes(ADMIN);
  expect(listed.timeOffTypes.some(({ timeOffType }) => timeOffType.id === type.id)).toBe(false);
  expect(listed.peopleWithTimeOff).toBe(0);
  const after = await service.readTermsTimeOff(ADMIN, termsIds);
  for (const termsId of termsIds) {
    expect(after.get(termsId)).toEqual(
      before.get(termsId)!.filter(({ timeOffType }) => timeOffType.id !== type.id),
    );
  }
});

test("deletes a type with a person's exception and keeps an unrelated type", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const policy = await seedTimeOffPolicy(orm, {
    name: "Study leave",
    balance: "unlimited_balance",
  });
  const unrelated = await seedTimeOffType(orm, "Volunteering");
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy.timeOffTypeId,
    timeOffPolicyId: policy.id,
  });
  const service = timeOffService(orm);
  await transact((tx) =>
    service.ensureAllowances(OWNER, tx, {
      employeeIds: [employee.id],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );
  const before = await service.readTimeOffTypes(ADMIN, { employeeIds: [employee.id] });
  expect(before.get(employee.id)).toMatchObject([{ timeOffType: { id: policy.timeOffTypeId } }]);

  await service.deleteType(ADMIN, { id: policy.timeOffTypeId });

  const after = await service.readTimeOffTypes(ADMIN, { employeeIds: [employee.id] });
  expect(after.get(employee.id)).toEqual([]);
  expect(
    (await service.listTimeOffTypes(ADMIN)).timeOffTypes.some(
      ({ timeOffType }) => timeOffType.id === unrelated.id,
    ),
  ).toBe(true);
});

test("deletes Annual leave offered on terms from the list and every terms", async ({
  orm,
  seed,
  transact,
}) => {
  const termsIds = [await seed.defaultTermsId(), await seed.terms("Scotland")];
  for (const termsId of termsIds) {
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ key: "uk_statutory_minimum" }],
    });
  }
  const service = timeOffService(orm);
  const listed = await service.listTimeOffTypes(ADMIN);
  const annualLeave = listed.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  const before = await service.readTermsTimeOff(ADMIN, termsIds);
  for (const termsId of termsIds) {
    expect(
      before.get(termsId)!.find(({ timeOffType }) => timeOffType.id === annualLeave.id)!.versions,
    ).toHaveLength(1);
  }

  await service.deleteType(ADMIN, { id: annualLeave.id });

  expect((await service.listTimeOffTypes(ADMIN)).timeOffTypes).toEqual(
    listed.timeOffTypes.filter(({ timeOffType }) => timeOffType.id !== annualLeave.id),
  );
  const after = await service.readTermsTimeOff(ADMIN, termsIds);
  for (const termsId of termsIds) {
    expect(after.get(termsId)).toEqual(
      before.get(termsId)!.filter(({ timeOffType }) => timeOffType.id !== annualLeave.id),
    );
  }
});

test("refuses deleting a type with booked time off without removing it", async ({ orm, seed }) => {
  const type = await seedTimeOffType(orm, "Study leave");
  const employee = await seed.employee();
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: type.id,
    status: "approved",
    days: [{ date: "2026-05-04", dayPart: "full_day" }],
  });
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);

  await expect(service.deleteType(ADMIN, { id: type.id })).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses deleting a type with unknown id %s",
  async (id, { orm }) => {
    await expect(timeOffService(orm).deleteType(ADMIN, { id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  },
);

test("refuses an employee deleting a type", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);

  await expect(service.deleteType(EMPLOYEE, { id: type.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("starting over restores deleted Annual leave with its standard name, look, privacy and key", async ({
  orm,
  transact,
}) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);
  const annualLeave = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  await service.deleteType(ADMIN, { id: annualLeave.id });
  expect(
    (await service.listTimeOffTypes(ADMIN)).timeOffTypes.some(
      ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
    ),
  ).toBe(false);

  await transact((tx) => deleteAllEmployees(orm)(OWNER, tx));

  const after = await service.listTimeOffTypes(ADMIN);
  expect(
    after.timeOffTypes.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")
      ?.timeOffType,
  ).toEqual({
    id: expect.any(String) as unknown,
    name: "Annual leave",
    icon: "sun",
    colour: "green",
    private: false,
    typeKey: "annual_leave",
    unit: "day",
  });
});
