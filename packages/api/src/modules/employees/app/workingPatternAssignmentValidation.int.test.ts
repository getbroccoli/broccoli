import { expect, OWNER, test, workingPatternService } from "#test/support";

test("assignment dates must be valid and the end cannot precede the start", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  const input = { employeeId: employee.id, policyId: standard.id, effectiveFrom: "2026-09-01" };

  await expect(
    patterns.assignPolicy(OWNER, { ...input, effectiveFrom: "September 1" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveFrom", code: "invalid" }],
  });
  await expect(
    patterns.assignPolicy(OWNER, { ...input, effectiveUntil: "September 30" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveUntil", code: "invalid" }],
  });
  await expect(
    patterns.assignPolicy(OWNER, { ...input, effectiveUntil: "2026-08-31" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "effectiveUntil", code: "before_start" }],
  });
});

test("an assignment requires an existing policy", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    workingPatternService(orm).assignPolicy(OWNER, {
      employeeId: employee.id,
      policyId: "00000000-0000-4000-8000-000000000001",
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "policyId", code: "not_found" }],
  });
});

test("working pattern operations refuse an unknown employee", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  const employeeId = "00000000-0000-4000-8000-000000000001";

  await expect(
    patterns.readWorkingWeeks(OWNER, {
      employeeIds: [employeeId],
      from: "2026-09-01",
      until: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.assignPolicy(OWNER, {
      employeeId,
      policyId: standard.id,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.endAssignment(OWNER, {
      employeeId,
      effectiveUntil: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removeAssignment(OWNER, {
      employeeId,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("ending an assignment requires an own assignment covering that date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  await expect(
    patterns.endAssignment(OWNER, {
      employeeId: employee.id,
      effectiveUntil: "2026-10-31",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("removing an assignment requires its exact start date", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPolicies(OWNER)).find((policy) => policy.isStandard)!;
  await patterns.assignPolicy(OWNER, {
    employeeId: employee.id,
    policyId: standard.id,
    effectiveFrom: "2026-09-01",
  });

  await expect(
    patterns.removeAssignment(OWNER, {
      employeeId: employee.id,
      effectiveFrom: "2026-09-15",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
