import {
  expect,
  importUseCases,
  NON_OWNER,
  OWNER,
  SETUP_AGENT,
  SETUP_HOLDER,
  storedFileIds,
  SYSTEM,
  test,
} from "#test/support";

test.for([undefined, null, {}, "people", []])(
  "requires a non-empty people array (%j)",
  async (people, { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      transact((tx) =>
        imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
          name: "staff.pdf",
          people,
        }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "people", code: "required" }],
    });

    expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  },
);

test("refuses more than 10,000 people without storing any", async ({ orm, transact }) => {
  const imports = importUseCases(orm);
  const people = Array.from({ length: 10_001 }, () => ({ fullName: "Avery Stone" }));

  await expect(
    transact((tx) =>
      imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
        name: "staff.pdf",
        people,
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "people", code: "too_many" }],
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
});

test("refuses an unknown field without echoing its key or value", async ({ orm, transact }) => {
  const imports = importUseCases(orm);

  const result = await Promise.allSettled([
    transact((tx) =>
      imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
        name: "staff.pdf",
        people: [{ fullName: "Avery Stone" }, { "private-key-sentinel": "private-value-sentinel" }],
      }),
    ),
  ]);

  expect(result).toMatchObject([
    {
      status: "rejected",
      reason: {
        code: "INVALID_INPUT",
        message: "The input is invalid.",
        fieldErrors: [{ field: "people[1]", code: "unknown_field" }],
      },
    },
  ]);
  expect(JSON.stringify(result)).not.toContain("private-key-sentinel");
  expect(JSON.stringify(result)).not.toContain("private-value-sentinel");
  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test.for(["firstName", "lastName", "fullName", "email", "jobTitle", "startDate"])(
  "refuses a non-string %s without storing a partial source",
  async (field, { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      transact((tx) =>
        imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
          name: "staff.pdf",
          people: [{ fullName: "Avery Stone" }, { [field]: 42 }],
        }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: `people[1].${field}`, code: "invalid" }],
    });

    expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
    expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
  },
);

test.for(["firstName", "lastName", "fullName", "email", "jobTitle", "startDate"])(
  "refuses a NUL in %s without storing a partial source",
  async (field, { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      transact((tx) =>
        imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
          name: "staff.pdf",
          people: [
            { fullName: "Morgan Reed", email: "morgan@example.com" },
            { fullName: "Avery Stone", email: "avery@example.com", [field]: "before\u0000after" },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: `people[1].${field}`, code: "invalid" }],
    });

    expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
    expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
  },
);

test.for(["firstName", "lastName", "fullName", "email", "jobTitle", "startDate"])(
  "refuses %s longer than 200 characters",
  async (field, { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      transact((tx) =>
        imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
          name: "staff.pdf",
          people: [{ [field]: "x".repeat(201) }],
        }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: `people[0].${field}`, code: "invalid" }],
    });

    expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  },
);

test.for([null, "not a person", 42, []])(
  "refuses a row that is not a person object (%j)",
  async (person, { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      transact((tx) =>
        imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
          name: "staff.pdf",
          people: [person],
        }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "people[0]", code: "unknown_field" }],
    });

    expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  },
);

test("requires a source name", async ({ orm, transact }) => {
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
        name: "",
        people: [{ fullName: "Avery Stone" }],
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
});

test.for([SETUP_HOLDER, OWNER, NON_OWNER, SYSTEM])(
  "refuses parsed people from a caller without an agent context",
  async (ctx, { orm, transact }) => {
    const imports = importUseCases(orm);

    await expect(
      transact((tx) =>
        imports.parsedSources.addParsedSource(ctx, tx, {
          name: "staff.pdf",
          people: [{ fullName: "Avery Stone" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only your agent can do this." });

    expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  },
);
