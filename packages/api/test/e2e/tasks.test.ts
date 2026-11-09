import { expect, TEST_OWNER, test } from "#test/support";

test("shows a manager's task as done to the person who asked after completion", async ({ env }) => {
  await env.signInAsOwner();
  const managerCredentials = { email: "manager@example.com", password: TEST_OWNER.password };
  const askerCredentials = { email: "asker@example.com", password: TEST_OWNER.password };
  const managerUser = await env.seed.user(managerCredentials);
  const askerUser = await env.seed.user(askerCredentials);
  const manager = await env.seed.employee({ userId: managerUser.id });
  const asker = await env.seed.employee({ userId: askerUser.id });
  await env.seed.manager(asker.id, manager.id);
  const task = await env.seed.task({
    assigneeEmployeeId: manager.id,
    requestedByEmployeeId: asker.id,
  });
  const { browser } = await env.signIn(managerCredentials);

  const before = await browser.graphql("query { myTasks { needsYou { id status } } }");
  expect(await before.json()).toEqual({
    data: { myTasks: { needsYou: [{ id: task.id, status: "TO_DO" }] } },
  });

  const completed = await browser.graphql(
    `
    mutation MarkDone($id: ID!) {
      tasks { markDone(input: { id: $id }) {
        task { id status doneBy { id } }
        error { __typename ... on Error { message } }
      } }
    }
  `,
    { id: task.id },
  );

  expect(await completed.json()).toEqual({
    data: {
      tasks: {
        markDone: {
          task: { id: task.id, status: "DONE", doneBy: { id: manager.id } },
          error: null,
        },
      },
    },
  });
  const { browser: askerBrowser } = await env.signIn(askerCredentials);
  const after = await askerBrowser.graphql(
    "query { myTasks { waitingOnOthers { id } resolvedRecently { id status doneBy { id } } } }",
  );
  expect(await after.json()).toEqual({
    data: {
      myTasks: {
        waitingOnOthers: [],
        resolvedRecently: [{ id: task.id, status: "DONE", doneBy: { id: manager.id } }],
      },
    },
  });
});

test("returns no task to an unrelated signed-in person", async ({ env }) => {
  await env.signInAsOwner();
  const holder = await env.seed.employee();
  const asker = await env.seed.employee();
  const credentials = { email: "other@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const task = await env.seed.task({
    assigneeEmployeeId: holder.id,
    requestedByEmployeeId: asker.id,
  });
  const { browser } = await env.signIn(credentials);

  const response = await browser.graphql("query Task($id: ID!) { task(id: $id) { id title } }", {
    id: task.id,
  });

  expect(await response.json()).toEqual({ data: { task: null } });
});

test("refuses my tasks without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql("query { myTasks { needsYou { id } } }");

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});
