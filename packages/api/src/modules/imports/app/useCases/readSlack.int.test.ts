import {
  expect,
  importUseCases,
  OWNER,
  PNG,
  fakeSlackApi,
  SLACK_PHOTO_URL,
  storedFileIds,
  test,
} from "#test/support";

test("the first Slack read creates a source and imports its members", async ({ orm, seed }) => {
  await seed.slackConnection();
  const imports = importUseCases(orm, {
    slackApi: fakeSlackApi([
      { id: "U1", profile: { first_name: "Avery", email: "avery@example.com" } },
    ]),
  });

  await imports.readSlack(OWNER);

  const sources = await imports.reads.listSources(OWNER);
  expect(sources).toMatchObject([{ kind: "slack", name: "Acme Workspace" }]);
  expect(sources).toHaveLength(1);
  expect(sources[0]!.readAt).toBeInstanceOf(Date);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: sources[0]!.id })).edges.map(
      ({ node }) => node,
    ),
  ).toMatchObject([{ sourceId: sources[0]!.id, firstName: "Avery", email: "avery@example.com" }]);
});

test("another read keeps surviving member ids, updates values, adds newcomers and removes leavers", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const source = await seed.importSource();
  const [avery] = await seed.importEmployees(source.id, [
    { externalId: "U1", firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
    { externalId: "U2", firstName: "Robin", email: "robin@example.com" },
  ]);
  const imports = importUseCases(orm, {
    slackApi: fakeSlackApi([
      {
        id: "U1",
        profile: {
          first_name: "Avery",
          last_name: "Reed",
          email: "avery.reed@example.com",
          title: "Designer",
        },
      },
      {
        id: "U3",
        profile: { first_name: "Sam", last_name: "Vale", email: "sam@example.com" },
      },
    ]),
  });

  await imports.readSlack(OWNER);

  const employees = await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id });
  expect(employees.edges.map(({ node }) => node)).toMatchObject([
    { ...avery, lastName: "Reed", email: "avery.reed@example.com", jobTitle: "Designer" },
    {
      sourceId: source.id,
      firstName: "Sam",
      lastName: "Vale",
      email: "sam@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
  expect(employees.edges[1]!.node.id).not.toBe(avery!.id);
  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, name: source.name },
  ]);
});

test("reading another workspace renames the same source and replaces its employees", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection({ teamId: "T2", teamName: "Acme Labs" });
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ externalId: "U1", firstName: "Avery" }]);
  const imports = importUseCases(orm, {
    slackApi: fakeSlackApi([
      {
        id: "U2",
        profile: { first_name: "Robin", last_name: "Reed", email: "robin@example.com" },
      },
    ]),
  });

  await imports.readSlack(OWNER);

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, kind: "slack", name: "Acme Labs" },
  ]);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges.map(
      ({ node }) => ({
        sourceId: node.sourceId,
        email: node.email,
      }),
    ),
  ).toEqual([{ sourceId: source.id, email: "robin@example.com" }]);
});

test("a failed Slack read passes the error through and preserves the source and its employees", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const source = await seed.importSource();
  const employees = await seed.importEmployees(source.id, [
    { externalId: "U1", firstName: "Avery" },
  ]);
  const error = new Error("Slack unavailable");
  const imports = importUseCases(orm, {
    slackApi: { listMembers: () => Promise.reject(error) },
  });

  await expect(imports.readSlack(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });

  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual(employees);
});

test("a refresh whose connection is no longer current leaves the records", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const source = await seed.importSource();
  const employees = await seed.importEmployees(source.id, [
    { externalId: "U1", firstName: "Avery" },
  ]);
  const imports = importUseCases(orm, {
    slackApi: {
      listMembers: async () => {
        await seed.slackConnection();
        return [];
      },
    },
  });

  await imports.readSlack(OWNER);

  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual(employees);
});

test("passes through the error when Slack is not connected", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(imports.readSlack(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Slack is not connected.",
  });
});

test("deletes a departed Slack member's record and stored photo on the next read", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  await seed.slackConnection();
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [
    { externalId: "U1", photoUrl: SLACK_PHOTO_URL },
  ]);
  await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importUseCases(orm, { slackApi: fakeSlackApi([]) });

  await imports.readSlack(OWNER);

  expect((await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges).toEqual(
    [],
  );
  expect(await storedFileIds(orm)).toEqual([]);
});
