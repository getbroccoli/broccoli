import {
  expect,
  OWNER,
  seedEmploymentEnd,
  seedTermsPeriods,
  test,
  workingPatternService,
} from "#test/support";

test.for([
  { when: "future", startDate: "2026-12-01", previousEnd: "2026-11-30" },
  { when: "past in this leave year", startDate: "2026-03-01", previousEnd: "2026-02-28" },
])("moves a person from a $when date", async ({ startDate, previousEnd }, { orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: "2024-03-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  const result = await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland,
    startDate,
  });

  expect(result).toEqual({ moved: [{ employeeId: employee.id, startDate }], skipped: [] });
  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toEqual([
    {
      termsId: england,
      termsName: "England and Wales",
      startDate: "2024-03-01",
      endDate: previousEnd,
    },
    { termsId: scotland, termsName: "Scotland", startDate, endDate: null },
  ]);
});

test("keeps a later scheduled move", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  const northernIreland = await seed.terms("Northern Ireland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: "2024-03-01", endDate: "2027-01-31" },
    { termsId: scotland, startDate: "2027-02-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: northernIreland,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toMatchObject([
    { termsId: england, startDate: "2024-03-01", endDate: "2026-11-30" },
    { termsId: northernIreland, startDate: "2026-12-01", endDate: "2027-01-31" },
    { termsId: scotland, startDate: "2027-02-01", endDate: null },
  ]);
});

test("replaces a scheduled move starting on the same date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  const northernIreland = await seed.terms("Northern Ireland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: "2024-03-01", endDate: "2026-11-30" },
    { termsId: scotland, startDate: "2026-12-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: northernIreland,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toMatchObject([
    { termsId: england, startDate: "2024-03-01", endDate: "2026-11-30" },
    { termsId: northernIreland, startDate: "2026-12-01", endDate: null },
  ]);
});

test("merges a move back onto the terms before it", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: "2024-03-01", endDate: "2026-11-30" },
    { termsId: scotland, startDate: "2026-12-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: england,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toEqual([
    { termsId: england, termsName: "England and Wales", startDate: "2024-03-01", endDate: null },
  ]);
});

test("moves a person who starts later from their start date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2027-01-10" });
  const scotland = await seed.terms("Scotland");
  const service = workingPatternService(orm, { today: "2026-11-09" });

  const result = await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland,
    startDate: "2026-12-01",
  });

  expect(result).toEqual({
    moved: [{ employeeId: employee.id, startDate: "2027-01-10" }],
    skipped: [],
  });
  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toEqual([
    { termsId: scotland, termsName: "Scotland", startDate: null, endDate: null },
  ]);
});

test("skips a person already on the terms on that date without changing their periods", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: await seed.defaultTermsId(), startDate: null, endDate: "2026-11-30" },
    { termsId: scotland, startDate: "2026-12-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });
  const before = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });

  const result = await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland,
    startDate: "2026-12-01",
  });

  expect(result).toEqual({
    moved: [],
    skipped: [{ employeeId: employee.id, reason: "ALREADY_ON_TERMS" }],
  });
  expect(await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] })).toEqual(before);
});

test("skips a person who left before the move date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  await seedEmploymentEnd(orm, employee.id, "2026-11-20");
  const scotland = await seed.terms("Scotland");
  const service = workingPatternService(orm, { today: "2026-11-09" });
  const before = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });

  const result = await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland,
    startDate: "2026-12-01",
  });

  expect(result).toEqual({
    moved: [],
    skipped: [{ employeeId: employee.id, reason: "LEFT_BEFORE_DATE" }],
  });
  expect(await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] })).toEqual(before);
});

test("moves some people and skips others in one save", async ({ orm, seed }) => {
  const first = await seed.employee({ startDate: "2024-03-01" });
  const already = await seed.employee({ startDate: "2024-03-01" });
  const last = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, already.id, [{ termsId: scotland, startDate: null, endDate: null }]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  const result = await service.changeTerms(OWNER, {
    employeeIds: [last.id, already.id, first.id],
    termsId: scotland,
    startDate: "2026-12-01",
  });

  expect(result).toEqual({
    moved: [
      { employeeId: last.id, startDate: "2026-12-01" },
      { employeeId: first.id, startDate: "2026-12-01" },
    ],
    skipped: [{ employeeId: already.id, reason: "ALREADY_ON_TERMS" }],
  });
  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [first.id, last.id] });
  for (const id of [first.id, last.id]) {
    expect(terms.get(id)?.periods.at(-1)).toMatchObject({
      termsId: scotland,
      startDate: "2026-12-01",
      endDate: null,
    });
  }
});

test("moves a person whose start moved past a planned move from their start, keeping earlier periods", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2027-01-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  const northernIreland = await seed.terms("Northern Ireland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: null, endDate: "2026-12-14" },
    { termsId: scotland, startDate: "2026-12-15", endDate: null },
  ]);
  const service = workingPatternService(orm, { today: "2026-11-09" });

  const result = await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: northernIreland,
    startDate: "2026-12-01",
  });

  expect(result).toEqual({
    moved: [{ employeeId: employee.id, startDate: "2027-01-01" }],
    skipped: [],
  });
  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toMatchObject([
    { termsId: england, startDate: null, endDate: "2026-12-14" },
    { termsId: scotland, startDate: "2026-12-15", endDate: "2026-12-31" },
    { termsId: northernIreland, startDate: "2027-01-01", endDate: null },
  ]);
});

test("No terms ends the current terms on the day before the change", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const service = workingPatternService(orm, { today });

  await service.changeTerms(OWNER, { ...noTerms, employeeIds: [employee.id] });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toMatchObject([
    { termsId: england, endDate: "2026-12-31" },
  ]);
});

test("No terms preserves a later scheduled move", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: england, startDate: null, endDate: "2027-01-31" },
    { termsId: scotland, startDate: "2027-02-01", endDate: null },
  ]);
  const service = workingPatternService(orm, { today });

  await service.changeTerms(OWNER, { ...noTerms, employeeIds: [employee.id] });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toMatchObject([
    { termsId: england, startDate: null, endDate: "2026-12-31" },
    { termsId: scotland, startDate: "2027-02-01", endDate: null },
  ]);
});

test("No terms from the person's first day leaves no terms periods", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: noTerms.startDate });
  const service = workingPatternService(orm, { today });

  await service.changeTerms(OWNER, { ...noTerms, employeeIds: [employee.id] });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.periods).toEqual([]);
});

test("skips a person already without terms on the chosen date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  await seed.leaveTerms(employee.id);
  const service = workingPatternService(orm, { today });

  const result = await service.changeTerms(OWNER, { ...noTerms, employeeIds: [employee.id] });

  expect(result).toEqual({
    moved: [],
    skipped: [{ employeeId: employee.id, reason: "ALREADY_ON_NO_TERMS" }],
  });
});

test("moves a person back onto terms after a gap", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const england = await seed.defaultTermsId();
  const scotland = await seed.terms("Scotland");
  const employeeIds = [employee.id];
  const service = workingPatternService(orm, { today });
  await service.changeTerms(OWNER, { ...noTerms, employeeIds });

  await service.changeTerms(OWNER, { employeeIds, termsId: scotland, startDate: "2027-03-01" });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds });
  expect(terms.get(employee.id)?.periods).toMatchObject([
    { termsId: england, endDate: "2026-12-31" },
    { termsId: scotland, startDate: "2027-03-01", endDate: null },
  ]);
});

test("a bulk move to No terms skips only the person already without terms", async ({
  orm,
  seed,
}) => {
  const current = await seed.employee({ startDate: "2024-03-01" });
  const already = await seed.employee({ startDate: "2024-03-01" });
  await seed.leaveTerms(already.id);
  const service = workingPatternService(orm, { today });

  const result = await service.changeTerms(OWNER, {
    ...noTerms,
    employeeIds: [already.id, current.id],
  });

  expect(result).toEqual({
    moved: [{ employeeId: current.id, startDate: noTerms.startDate }],
    skipped: [{ employeeId: already.id, reason: "ALREADY_ON_NO_TERMS" }],
  });
});

const today = "2026-11-09";
const noTerms = { termsId: null, startDate: "2027-01-01" };
