import { expect, OWNER, test, workingPatternService } from "#test/support";

test("a newer assignment ends the earlier one without resuming it afterwards", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPolicy(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  const friday = await patterns.createPolicy(OWNER, {
    name: "Friday",
    minutes: [0, 0, 0, 0, 450, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: monday.id,
    effectiveFrom: "2026-08-01",
  });

  const history = await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: friday.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  expect(history.changes).toMatchObject([
    { field: "workingPattern", oldValue: "Monday", newValue: "Friday" },
    { field: "effectiveFrom", oldValue: null, newValue: "2026-09-01" },
  ]);
  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-08-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    { effectiveFrom: "2026-08-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: [0, 0, 0, 0, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
  ]);
});

test("an assignment on the same start date replaces the existing assignment", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPolicy(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
  });

  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: monday.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-09-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    { effectiveFrom: "2026-09-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
  ]);
});

test("an assignment cannot overlap a later assignment and a refusal preserves existing weeks", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPolicy(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: monday.id,
    effectiveFrom: "2026-10-01",
  });
  const period = { employeeIds: [employee.id], from: "2026-08-01", until: "2026-11-30" };
  const before = await patterns.readWorkingWeeks(OWNER, period);

  await expect(
    patterns.assignPolicy(OWNER, {
      employeeId: employee.id,
      policyId: standard.id,
      effectiveFrom: "2026-09-01",
      effectiveUntil: "2026-10-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveUntil", code: "overlaps" }],
  });
  await expect(
    patterns.assignPolicy(OWNER, {
      employeeId: employee.id,
      policyId: standard.id,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveUntil", code: "overlaps" }],
  });
  expect(await patterns.readWorkingWeeks(OWNER, period)).toEqual(before);
});

test("an assignment may end the day before a later assignment starts", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPolicy(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: standard.id,
    effectiveFrom: "2026-10-01",
  });

  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: monday.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-09-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    { effectiveFrom: "2026-09-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
  ]);
});
