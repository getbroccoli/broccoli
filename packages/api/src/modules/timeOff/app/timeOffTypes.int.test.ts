import {
  ADMIN,
  deleteAllEmployees,
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  OWNER,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";

test("adds a trimmed type with its look and privacy after standard types, ordered by name", async ({
  orm,
}) => {
  await seedTimeOffType(orm, "Volunteering");
  await seedTimeOffType(orm, "Moving day");
  const service = timeOffService(orm);

  const created = await service.createType(ADMIN, { ...studyLeave, name: "  Study leave  " });

  expect(created).toEqual({ ...studyLeave, ...ownType, id: expect.any(String) as unknown });
  const listed = await service.listTimeOffTypes(ADMIN);
  expect(listed.timeOffTypes.map(({ timeOffType }) => timeOffType.name)).toEqual([
    "Annual leave",
    "Sickness",
    "Family leave",
    "Other",
    "Moving day",
    "Study leave",
    "Volunteering",
  ]);
  expect(
    listed.timeOffTypes.find(({ timeOffType }) => timeOffType.id === created.id)?.timeOffType,
  ).toEqual(created);
});

test("leaves a new type not offered on every terms", async ({ orm, seed, transact }) => {
  const defaultId = await seed.defaultTermsId();
  const otherId = await seed.terms("Scotland");
  await giveTermsPolicies(orm, transact, {
    termsId: defaultId,
    policies: [{ key: "uk_statutory_minimum" }],
  });
  const service = timeOffService(orm);

  const created = await service.createType(ADMIN, { ...studyLeave, private: true });

  const terms = await service.readTermsTimeOff(ADMIN, [defaultId, otherId]);
  for (const id of [defaultId, otherId]) {
    expect(terms.get(id)!.find(({ timeOffType }) => timeOffType.id === created.id)).toEqual({
      timeOffType: created,
      versions: [],
    });
  }
});

test.for([
  { name: "   ", code: "required" },
  { name: "a".repeat(61), code: "too_long" },
])(
  "refuses a new type name with error $code without storing it",
  async ({ name, code }, { orm }) => {
    const service = timeOffService(orm);
    const before = await service.listTimeOffTypes(ADMIN);

    await expect(service.createType(ADMIN, { ...studyLeave, name })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code }],
    });

    expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
  },
);

test.for([
  { name: "   ", code: "required" },
  { name: "a".repeat(61), code: "too_long" },
])(
  "refuses changing a type name with error $code without changing it",
  async ({ name, code }, { orm }) => {
    const type = await seedTimeOffType(orm, "Study leave");
    const service = timeOffService(orm);
    const before = await service.listTimeOffTypes(ADMIN);

    await expect(
      service.changeType(ADMIN, { ...studyLeave, id: type.id, name }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code }],
    });

    expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
  },
);

test("refuses adding another type's name ignoring case and surrounding spaces", async ({ orm }) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);

  await expect(
    service.createType(ADMIN, { ...studyLeave, name: "  annual LEAVE " }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("refuses changing to another type's name ignoring case and surrounding spaces", async ({
  orm,
}) => {
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);

  await expect(
    service.changeType(ADMIN, { ...studyLeave, id: type.id, name: "  annual LEAVE " }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("allows a type its own name in another case", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffService(orm);

  const changed = await service.changeType(ADMIN, {
    ...studyLeave,
    id: type.id,
    name: "STUDY LEAVE",
  });

  expect(changed).toEqual({ ...studyLeave, ...ownType, id: type.id, name: "STUDY LEAVE" });
  const listed = await service.listTimeOffTypes(ADMIN);
  expect(
    listed.timeOffTypes.find(({ timeOffType }) => timeOffType.id === type.id)?.timeOffType,
  ).toEqual(changed);
});

test("changes a type's name, icon, colour and privacy without changing other types", async ({
  orm,
}) => {
  const service = timeOffService(orm);
  const type = await service.createType(ADMIN, studyLeave);
  const before = await service.listTimeOffTypes(ADMIN);

  const changed = await service.changeType(ADMIN, {
    id: type.id,
    name: "  Training  ",
    icon: "book_open",
    colour: "purple",
    private: true,
  });

  expect(changed).toEqual({
    id: type.id,
    name: "Training",
    ...ownType,
    icon: "book_open",
    colour: "purple",
    private: true,
  });
  const after = await service.listTimeOffTypes(ADMIN);
  expect(
    after.timeOffTypes.find(({ timeOffType }) => timeOffType.id === type.id)?.timeOffType,
  ).toEqual(changed);
  expect(after.timeOffTypes.filter(({ timeOffType }) => timeOffType.id !== type.id)).toEqual(
    before.timeOffTypes.filter(({ timeOffType }) => timeOffType.id !== type.id),
  );
});

test("renaming Annual leave keeps its key and every terms' rules", async ({
  orm,
  seed,
  transact,
}) => {
  const defaultId = await seed.defaultTermsId();
  const otherId = await seed.terms("Scotland");
  await giveTermsPolicies(orm, transact, {
    termsId: defaultId,
    policies: [{ key: "uk_statutory_minimum" }],
  });
  await giveTermsPolicies(orm, transact, {
    termsId: otherId,
    policies: [{ key: "uk_25_days_plus_bank_holidays" }],
  });
  const service = timeOffService(orm);
  const before = await service.readTermsTimeOff(ADMIN, [defaultId, otherId]);
  const annualLeave = before
    .get(defaultId)!
    .find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!;

  const changed = await service.changeType(ADMIN, {
    id: annualLeave.timeOffType.id,
    name: "Paid leave",
    icon: "sun",
    colour: "green",
    private: false,
  });

  expect(changed).toEqual({ ...annualLeave.timeOffType, name: "Paid leave" });
  const after = await service.readTermsTimeOff(ADMIN, [defaultId, otherId]);
  for (const id of [defaultId, otherId]) {
    const original = before
      .get(id)!
      .find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!;
    expect(original.versions).toHaveLength(1);
    expect(after.get(id)!.find(({ timeOffType }) => timeOffType.id === changed.id)).toEqual({
      timeOffType: changed,
      versions: original.versions,
    });
  }
});

test("refuses making Sickness not private", async ({ orm }) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);
  const sickness = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "sickness",
  )!.timeOffType;

  await expect(
    service.changeType(ADMIN, {
      id: sickness.id,
      name: sickness.name,
      icon: "thermometer",
      colour: "coral",
      private: false,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "private", code: "sickness_private" }],
  });

  expect(sickness).toMatchObject({ private: true });
  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test.for(["not-a-uuid", "00000000-0000-4000-8000-000000000001"])(
  "refuses changing a type with unknown id %s",
  async (id, { orm }) => {
    await expect(
      timeOffService(orm).changeType(ADMIN, { ...studyLeave, id }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  },
);

test("refuses an employee adding a type", async ({ orm }) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);

  await expect(service.createType(EMPLOYEE, studyLeave)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("refuses an employee changing a type", async ({ orm }) => {
  const type = await seedTimeOffType(orm, "Study leave");
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);

  await expect(
    service.changeType(EMPLOYEE, { ...studyLeave, id: type.id, name: "Training" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("starting over removes added types and restores the standard types", async ({
  orm,
  transact,
}) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);
  const annualLeave = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  await service.createType(ADMIN, studyLeave);
  await service.changeType(ADMIN, {
    id: annualLeave.id,
    name: "Paid leave",
    icon: "airplane",
    colour: "blue",
    private: true,
  });

  await transact((tx) => deleteAllEmployees(orm)(OWNER, tx));

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

test("starting over restores standard names that other standard types took", async ({
  orm,
  transact,
}) => {
  const service = timeOffService(orm);
  const before = await service.listTimeOffTypes(ADMIN);
  const annualLeave = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "annual_leave",
  )!.timeOffType;
  const other = before.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "other",
  )!.timeOffType;
  await service.changeType(ADMIN, {
    id: annualLeave.id,
    name: "Holiday",
    icon: "sun",
    colour: "green",
    private: false,
  });
  await service.changeType(ADMIN, {
    id: other.id,
    name: "Annual leave",
    icon: "confetti",
    colour: "yellow",
    private: false,
  });

  await transact((tx) => deleteAllEmployees(orm)(OWNER, tx));

  expect(await service.listTimeOffTypes(ADMIN)).toEqual(before);
});

const studyLeave = {
  name: "Study leave",
  icon: "graduation_cap",
  colour: "blue",
  private: false,
} as const;
const ownType = { typeKey: null, unit: "day" } as const;
