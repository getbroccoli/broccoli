import { onTestFinished } from "vitest";

import { expect, importUseCases, OWNER, test } from "#test/support";

import type { SlackMember } from "../../../../integrations/slack";

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
    slackApi: {
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
    slackApi: {
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

test("a pending refresh preserves the records from reconnecting the same workspace", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { externalId: "U1", firstName: "Avery", email: "avery@example.com" },
  ]);
  await seed.slackConnection("old-test-token");
  const readStarted = Promise.withResolvers<void>();
  const heldRead = Promise.withResolvers<SlackMember[]>();
  const oldMembers = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
  ];
  const imports = importUseCases(orm, {
    slackAuthorization: {
      exchange: () =>
        Promise.resolve({
          accessToken: "new-test-token",
          scopes: ["users:read", "users:read.email"],
          team: { id: "T1", name: "Acme Workspace" },
        }),
    },
    slackApi: {
      listMembers: (token) => {
        if (token === "old-test-token") {
          readStarted.resolve();
          return heldRead.promise;
        }
        expect(token).toBe("new-test-token");
        return Promise.resolve([
          {
            id: "U2",
            profile: { first_name: "Robin", last_name: "Reed", email: "robin@example.com" },
          },
        ]);
      },
    },
  });

  const pending = imports.refreshSlack(OWNER);
  onTestFinished(async () => {
    heldRead.resolve(oldMembers);
    await pending;
  });
  await readStarted.promise;
  await imports.connectSlack(OWNER, { code: "new-code", codeVerifier: "test-verifier" });
  const reconnected = await imports.listEmployees(OWNER, {});
  expect(reconnected.edges.map(({ node }) => node)).toMatchObject([
    { sourceId: source.id, email: "robin@example.com" },
  ]);
  heldRead.resolve(oldMembers);
  await pending;

  expect(await imports.listEmployees(OWNER, {})).toEqual(reconnected);
});

test("refuses to refresh before Slack is connected", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(imports.refreshSlack(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Slack is not connected.",
  });
});
