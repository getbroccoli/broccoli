import { expect, OWNER, test, workingPatternService } from "#test/support";

test("previews a move without writing it", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await seed.terms("Scotland");
  const service = workingPatternService(orm, { today: "2026-11-09" });
  const input = { employeeIds: [employee.id], termsId: scotland, startDate: "2026-12-01" };
  const before = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });

  const preview = await service.previewTermsChange(OWNER, input);

  const moved = [{ employeeId: employee.id, startDate: "2026-12-01" }];
  expect(preview).toMatchObject({ moved, skipped: [] });
  expect(await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] })).toEqual(before);
  expect(await service.changeTerms(OWNER, input)).toEqual({ moved, skipped: [] });
});

test("previews the end of inherited terms and the working week during a gap", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  const service = workingPatternService(orm, { today: "2026-11-09" });

  const preview = await service.previewTermsChange(OWNER, {
    employeeIds: [employee.id],
    termsId: null,
    startDate: "2027-01-01",
  });

  expect(preview.moved).toMatchObject([
    {
      employeeId: employee.id,
      currentTerms: {
        periods: [{ termsId, endDate: null }],
        workingWeek: [{ source: "from_their_terms" }],
      },
      employmentTerms: { periods: [{ termsId, endDate: "2026-12-31" }], workingWeek: [] },
    },
  ]);
});
