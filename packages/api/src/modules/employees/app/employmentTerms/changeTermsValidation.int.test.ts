import { EMPLOYEE, expect, OWNER, test, workingPatternService } from "#test/support";

test("refuses a move before this leave year", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.terms("Scotland");
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.changeTerms(OWNER, {
      employeeIds: [employee.id],
      termsId,
      startDate: "2025-12-31",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });
});

test("refuses unknown terms", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.changeTerms(OWNER, {
      employeeIds: [employee.id],
      termsId: "00000000-0000-4000-8000-000000000001",
      startDate: "2026-12-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "termsId", code: "not_found" }],
  });
});

test.for([
  { count: 0, code: "required" },
  { count: 1001, code: "too_many" },
])("refuses a selection of $count people", async ({ count, code }, { orm, seed }) => {
  const termsId = await seed.terms("Scotland");
  const employeeIds = Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.changeTerms(OWNER, { employeeIds, termsId, startDate: "2026-12-01" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT", fieldErrors: [{ field: "employeeIds", code }] });
});

test("refuses an unknown employee", async ({ orm, seed }) => {
  const termsId = await seed.terms("Scotland");
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.changeTerms(OWNER, {
      employeeIds: ["00000000-0000-4000-8000-000000000001"],
      termsId,
      startDate: "2026-12-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("refuses a move by a caller who is not an admin", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.terms("Scotland");
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.changeTerms(EMPLOYEE, {
      employeeIds: [employee.id],
      termsId,
      startDate: "2026-12-01",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
