import {
  ADMIN,
  EMPLOYEE,
  expect,
  OWNER,
  seedEmploymentEnd,
  test,
  workingPatternService,
} from "#test/support";

test("pattern reach includes later joiners, excludes leavers and personal weeks, and sorts by name", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const pattern = (await patterns.listPatterns(OWNER)).find((item) => item.termsId === termsId)!;
  const zoe = await seed.employee({ firstName: "Zoe", lastName: "Able", startDate: "2025-01-01" });
  const amyZed = await seed.employee({
    firstName: "Amy",
    lastName: "Zed",
    startDate: "2026-12-01",
  });
  await seed.moveToTerms(amyZed.id, termsId, "2026-12-01");
  const amyAble = await seed.employee({
    firstName: "Amy",
    lastName: "Able",
    startDate: "2025-01-01",
  });
  const left = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, left.id, "2026-10-31");
  const personal = await seed.employee({ startDate: "2025-01-01" });
  const named = await patterns.createPattern(OWNER, {
    name: "Personal week",
    minutes: [450, 0, 0, 0, 0, 0, 0],
  });
  await patterns.assignPattern(OWNER, {
    employeeId: personal.id,
    workingPatternId: named.id,
    startDate: "2026-01-01",
  });

  const reached = await patterns.readPatternReach(ADMIN, {
    workingPatternId: pattern.id,
    from: "2026-11-01",
  });

  expect(reached.map(({ id }) => id)).toEqual([amyAble.id, amyZed.id, zoe.id]);
});

test("an employee cannot read a working pattern's reach", async ({ orm }) => {
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const [pattern] = await patterns.listPatterns(OWNER);

  await expect(
    patterns.readPatternReach(EMPLOYEE, { workingPatternId: pattern!.id, from: "2026-11-01" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("reading an unknown working pattern's reach is refused", async ({ orm }) => {
  const patterns = workingPatternService(orm, { today: "2026-11-06" });

  await expect(
    patterns.readPatternReach(ADMIN, {
      workingPatternId: "00000000-0000-4000-8000-000000000001",
      from: "2026-11-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
