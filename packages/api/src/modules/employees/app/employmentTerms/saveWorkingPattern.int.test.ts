import {
  ADMIN,
  expect,
  OWNER,
  test,
  termsService,
  workingPatternService,
  seedTermsWeek,
  calendarDate,
  giveTermsPolicies,
  readAllowances,
  timeOffPolicyService,
} from "#test/support";
import { workingPatternRepository } from "../../db";

test("saving creates then updates the same unpublished week and raises its revision", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const service = workingPatternService(orm);
  const first = await service.saveWorkingPattern(ADMIN, {
    termsId,
    minutes: [450, 450, 450, 450, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  const saved = await service.saveWorkingPattern(ADMIN, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "northern_ireland",
  });

  expect(saved).toMatchObject({
    id: first.id,
    workingPatternId: first.workingPatternId,
    termsId,
    status: "draft",
    revision: 2,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "northern_ireland",
  });
  expect(await termsService(orm).readTerms(OWNER, termsId)).toMatchObject({
    unpublishedWorkingWeek: saved,
  });
});

test("terms sharing a published pattern keep separate unpublished weeks", async ({ orm, seed }) => {
  const firstTermsId = await seed.terms("First");
  const otherTermsId = await seed.terms("Other");
  const original = await seedTermsWeek(orm, { termsId: firstTermsId, startDate: "2026-01-01" });
  await workingPatternRepository(orm).insertAssignment({
    owner: { termsId: otherTermsId },
    versionId: original.versionId,
    startDate: calendarDate("2026-01-01"),
    endDate: null,
  });
  const service = workingPatternService(orm);
  const first = await service.saveWorkingPattern(OWNER, {
    termsId: firstTermsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  const other = await service.saveWorkingPattern(OWNER, {
    termsId: otherTermsId,
    minutes: [360, 360, 360, 360, 360, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  expect(other).toMatchObject({
    workingPatternId: first.workingPatternId,
    termsId: otherTermsId,
    revision: 1,
  });
  expect(other.id).not.toBe(first.id);
  expect((await termsService(orm).readTerms(OWNER, firstTermsId))!.unpublishedWorkingWeek).toEqual(
    first,
  );
});

test("saving and discarding leave working weeks, allowances and history unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const service = workingPatternService(orm);
  const period = { employeeIds: [employee.id], from: "2026-01-01", until: "2026-12-31" };
  const weeks = await service.readWorkingWeeks(OWNER, period);
  const allowances = await readAllowances(orm, employee.id);
  const history = await termsService(orm).readTermsHistory(OWNER, termsId, {});

  const draft = await service.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  expect(await service.readWorkingWeeks(OWNER, period)).toEqual(weeks);
  expect(await readAllowances(orm, employee.id)).toEqual(allowances);
  expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);

  await service.discardWorkingPattern(OWNER, { versionId: draft.id });

  expect(await service.readWorkingWeeks(OWNER, period)).toEqual(weeks);
  expect(await readAllowances(orm, employee.id)).toEqual(allowances);
  expect(await termsService(orm).readTermsHistory(OWNER, termsId, {})).toEqual(history);
  expect(await termsService(orm).readTerms(OWNER, termsId)).toMatchObject({
    unpublishedWorkingWeek: null,
  });
});

test("discarding a new terms' only version removes its pattern", async ({ orm }) => {
  const terms = await termsService(orm).createTerms(OWNER, {
    name: "New terms",
    bankHolidayCalendar: "scotland",
  });
  const draft = terms.unpublishedWorkingWeek!;

  await workingPatternService(orm).discardWorkingPattern(OWNER, { versionId: draft.id });

  expect((await workingPatternRepository(orm).findPatterns()).map(({ id }) => id)).not.toContain(
    draft.workingPatternId,
  );
  expect(await termsService(orm).readTerms(OWNER, terms.id)).toMatchObject({
    workingWeek: [],
    unpublishedWorkingWeek: null,
  });
});

test("saving after publication creates a new version and never edits the published settings", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const service = workingPatternService(orm);
  const first = await service.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [{ id: first.id, revision: first.revision }],
    startDate: "2026-06-01",
    owners: [{ termsId }],
  });
  const published = (await workingPatternRepository(orm).findPatterns())
    .find(({ id }) => id === first.workingPatternId)!
    .versions.find(({ id }) => id === first.id)!;

  const next = await service.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [360, 360, 360, 360, 360, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  expect(next.id).not.toBe(first.id);
  expect(next).toMatchObject({
    status: "draft",
    revision: 1,
    workingPatternId: first.workingPatternId,
  });
  expect(
    (await workingPatternRepository(orm).findPatterns()).find(
      ({ id }) => id === first.workingPatternId,
    )!.versions,
  ).toContainEqual(published);
  expect(published).toMatchObject({
    status: "published",
    termsId: null,
    minutes: first.minutes,
    bankHolidayCalendar: first.bankHolidayCalendar,
  });
});

test("discard refuses a published week", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const [assignment] = await workingPatternRepository(orm).findAssignments({ termsIds: [termsId] });

  await expect(
    workingPatternService(orm).discardWorkingPattern(OWNER, { versionId: assignment!.versionId }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No unpublished working week has this id.",
  });
});

test("discard refuses an unknown week", async ({ orm }) => {
  await expect(
    workingPatternService(orm).discardWorkingPattern(OWNER, {
      versionId: "00000000-0000-4000-8000-000000000001",
    }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No unpublished working week has this id.",
  });
});
