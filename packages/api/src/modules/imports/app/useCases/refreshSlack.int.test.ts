import { expect, importUseCases, OWNER, test } from "#test/support";

test("refresh keeps surviving member ids, updates their values, adds newcomers and removes leavers", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  const [avery] = await seed.importEmployees(source.id, [
    { externalId: "U1", firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
    { externalId: "U2", firstName: "Robin", email: "robin@example.com" },
  ]);
  await seed.slackConnection();
  const imports = importUseCases(orm, {
    slack: {
      listMembers: (token) => {
        expect(token).toBe("test-slack-token");
        return Promise.resolve([
          {
            id: "U1",
            profile: {
              first_name: "Avery",
              last_name: "Reed",
              email: "avery.reed@example.com",
              title: "Designer",
            },
          },
          { id: "U3", profile: { first_name: "Sam", last_name: "Vale", email: "sam@example.com" } },
        ]);
      },
    },
  });

  await imports.refreshSlack(OWNER);

  const employees = await imports.listEmployees(OWNER, {});
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
  expect(await imports.listSources(OWNER)).toMatchObject([{ id: source.id, name: source.name }]);
});

test("a failed Slack read preserves the source and all its employees", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const employees = await seed.importEmployees(source.id, [
    { externalId: "U1", firstName: "Avery" },
  ]);
  await seed.slackConnection();
  const imports = importUseCases(orm, {
    slack: {
      listMembers: () => Promise.reject(new Error("Slack unavailable")),
    },
  });

  await expect(imports.refreshSlack(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });

  expect(await imports.listSources(OWNER)).toEqual([source]);
  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toEqual(employees);
});

test("refuses to refresh before Slack is connected", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(imports.refreshSlack(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Slack is not connected.",
  });
});
