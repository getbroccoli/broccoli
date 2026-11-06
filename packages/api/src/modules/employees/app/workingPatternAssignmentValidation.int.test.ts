import { expect, OWNER, test, workingPatternService, createStandardPattern } from "#test/support";

test("an assignment end cannot precede its start", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = await createStandardPattern(orm);
  const input = {
    employeeId: employee.id,
    workingPatternId: standard.id,
    startDate: "2026-09-01",
  };

  await expect(
    patterns.assignPattern(OWNER, { ...input, endDate: "2026-08-31" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "endDate", code: "before_start" }],
  });
});

test("an assignment requires an existing pattern", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    workingPatternService(orm).assignPattern(OWNER, {
      employeeId: employee.id,
      workingPatternId: "00000000-0000-4000-8000-000000000001",
      startDate: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "workingPatternId", code: "not_found" }],
  });
});

test("working pattern operations refuse an unknown employee", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = await createStandardPattern(orm);
  const employeeId = "00000000-0000-4000-8000-000000000001";

  await expect(
    patterns.readWorkingWeeks(OWNER, {
      employeeIds: [employeeId],
      from: "2026-09-01",
      until: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.assignPattern(OWNER, {
      employeeId,
      workingPatternId: standard.id,
      startDate: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.endAssignment(OWNER, {
      employeeId,
      endDate: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removeAssignment(OWNER, {
      employeeId,
      startDate: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("ending an assignment requires an own assignment covering that date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = await createStandardPattern(orm);
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: standard.id,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });

  await expect(
    patterns.endAssignment(OWNER, {
      employeeId: employee.id,
      endDate: "2026-10-31",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("removing an assignment requires its exact start date", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = await createStandardPattern(orm);
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: standard.id,
    startDate: "2026-09-01",
  });

  await expect(
    patterns.removeAssignment(OWNER, {
      employeeId: employee.id,
      startDate: "2026-09-15",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("a terms' pattern cannot be assigned to a person", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const termsId = await seed.defaultTermsId();
  const patterns = workingPatternService(orm);
  const pattern = (await patterns.listPatterns(OWNER)).find(
    (pattern) => pattern.termsId === termsId,
  )!;

  await expect(
    patterns.assignPattern(OWNER, {
      employeeId: employee.id,
      workingPatternId: pattern.id,
      startDate: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "workingPatternId", code: "belongs_to_terms" }],
  });
});
