import { ADMIN, expect, OWNER, test, workingPatternService } from "#test/support";

test("an admin creates a policy with one week applying from the beginning", async ({ orm }) => {
  const patterns = workingPatternService(orm);

  const policy = await patterns.createPolicy(ADMIN, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
    fullDayMinutes: 450,
  });

  expect(policy).toMatchObject({
    name: "Tuesday to Thursday",
    isStandard: false,
    weeks: [{ effectiveFrom: null, minutes: [0, 450, 450, 450, 0, 0, 0], fullDayMinutes: 450 }],
  });
  expect(await patterns.listPolicies(ADMIN)).toContainEqual(policy);
});

test("changing a policy on an existing date replaces that week's minutes", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.changePolicy(OWNER, {
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  const changed = await patterns.changePolicy(OWNER, {
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 450,
  });

  expect(changed.weeks).toEqual([
    { effectiveFrom: null, minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: [420, 420, 420, 420, 420, 0, 0], fullDayMinutes: 450 },
  ]);
  expect(await patterns.listPolicies(OWNER)).toContainEqual(changed);
});

test("removing a policy week restores the earlier week until the next change", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.changePolicy(OWNER, {
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });
  await patterns.changePolicy(OWNER, {
    policyId: standard.id,
    effectiveFrom: "2026-10-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 450,
  });

  const changed = await patterns.removePolicyWeek(OWNER, {
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
  });

  expect(changed.weeks).toEqual([
    { effectiveFrom: null, minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [420, 420, 420, 420, 420, 0, 0], fullDayMinutes: 450 },
  ]);
  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-09-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    { effectiveFrom: "2026-09-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [420, 420, 420, 420, 420, 0, 0], fullDayMinutes: 450 },
  ]);
});

test("renaming Standard preserves its identity and weeks", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;

  const renamed = await patterns.renamePolicy(OWNER, { policyId: standard.id, name: "Full time" });

  expect(renamed).toEqual({ ...standard, name: "Full time" });
  expect(await patterns.listPolicies(OWNER)).toContainEqual(renamed);
  await expect(patterns.deletePolicy(OWNER, { policyId: renamed.id })).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test("deleting an unused policy removes it from the list", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const policy = await patterns.createPolicy(OWNER, {
    name: "Unused",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });

  await patterns.deletePolicy(OWNER, { policyId: policy.id });

  expect((await patterns.listPolicies(OWNER)).map(({ id }) => id)).not.toContain(policy.id);
});

test("a policy assigned to an employee cannot be deleted", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const policy = await patterns.createPolicy(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: policy.id,
    effectiveFrom: "2026-09-01",
  });

  await expect(patterns.deletePolicy(OWNER, { policyId: policy.id })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await patterns.listPolicies(OWNER)).toContainEqual(policy);
});

test("a policy linked to an empty group cannot be deleted", async ({ orm, seed }) => {
  const patterns = workingPatternService(orm);
  const policy = await patterns.createPolicy(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setGroupPattern(OWNER, {
    policyGroupId: await seed.policyGroup(),
    policyId: policy.id,
    effectiveFrom: "2026-09-01",
  });

  await expect(patterns.deletePolicy(OWNER, { policyId: policy.id })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await patterns.listPolicies(OWNER)).toContainEqual(policy);
});

test("policy changes refuse an unknown policy", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const policyId = "00000000-0000-4000-8000-000000000001";

  await expect(patterns.renamePolicy(OWNER, { policyId, name: "Missing" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    patterns.changePolicy(OWNER, {
      policyId,
      effectiveFrom: "2026-09-01",
      minutes: [450, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removePolicyWeek(OWNER, { policyId, effectiveFrom: "2026-09-01" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(patterns.deletePolicy(OWNER, { policyId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("removing a date without a policy week leaves its first week intact", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;

  await expect(
    patterns.removePolicyWeek(OWNER, {
      policyId: standard.id,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect(await patterns.listPolicies(OWNER)).toContainEqual(standard);
});
