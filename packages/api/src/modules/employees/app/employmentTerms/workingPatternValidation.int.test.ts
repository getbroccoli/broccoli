import { EMPLOYEE, expect, OWNER, test, workingPatternService } from "#test/support";

test("saving refuses an unknown bank holiday calendar", async ({ orm, seed }) => {
  await expect(
    workingPatternService(orm).saveWorkingPattern(OWNER, {
      termsId: await seed.defaultTermsId(),
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "unknown",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "bankHolidayCalendar", code: "invalid" }],
  });
});

test("saving refuses unknown terms", async ({ orm }) => {
  await expect(
    workingPatternService(orm).saveWorkingPattern(OWNER, {
      termsId: "00000000-0000-4000-8000-000000000001",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "termsId", code: "not_found" }],
  });
});

test.for([
  { minutes: [-1, 450, 0, 0, 0, 0, 0], code: "out_of_range" },
  { minutes: [0, 0, 0, 0, 0, 0, 0], code: "no_working_day" },
] as const)(
  "saving refuses invalid minutes with $code",
  async ({ minutes, code }, { orm, seed }) => {
    await expect(
      workingPatternService(orm).saveWorkingPattern(OWNER, {
        termsId: await seed.defaultTermsId(),
        minutes,
        bankHolidayCalendar: "england_and_wales",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", fieldErrors: [{ field: "minutes", code }] });
  },
);

test("an employee cannot save an unpublished week", async ({ orm, seed }) => {
  await expect(
    workingPatternService(orm).saveWorkingPattern(EMPLOYEE, {
      termsId: await seed.defaultTermsId(),
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("an employee cannot discard an unpublished week", async ({ orm, seed }) => {
  const service = workingPatternService(orm);
  const draft = await service.saveWorkingPattern(OWNER, {
    termsId: await seed.defaultTermsId(),
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  await expect(
    service.discardWorkingPattern(EMPLOYEE, { versionId: draft.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("an employee cannot cancel a planned week", async ({ orm }) => {
  await expect(
    workingPatternService(orm).cancelWorkingPatternChange(EMPLOYEE, {
      assignmentId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
