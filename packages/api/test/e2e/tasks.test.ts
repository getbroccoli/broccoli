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
    askedByEmployeeId: asker.id,
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

test("returns a completion history line and restricts shared task history to its readers", async ({
  env,
}) => {
  const { browser } = await env.startDemo();
  const listed = await browser.graphql("query { myTasks { needsYou { id } } }");
  const body = (await listed.json()) as { data: { myTasks: { needsYou: { id: string }[] } } };
  const { id } = body.data.myTasks.needsYou[0]!;

  const completed = await browser.graphql(MARK_DONE_WITH_HISTORY, { id });

  expect(await completed.json()).toEqual({
    data: {
      tasks: {
        markDone: {
          task: {
            id,
            history: {
              edges: [{ node: { operation: "UPDATED" } }, { node: { operation: "CREATED" } }],
            },
          },
          historyLine: {
            operation: "UPDATED",
            changes: [{ field: "status", oldValue: "to_do", newValue: "done" }],
            record: {
              id,
              access: { canUpdate: false, canDelete: false, editableFields: [] },
            },
          },
          error: null,
        },
      },
    },
  });
  const history = await browser.graphql(TASK_HISTORY, { id });
  expect(await history.json()).toEqual({
    data: {
      recordHistory: {
        edges: [{ node: { operation: "UPDATED" } }, { node: { operation: "CREATED" } }],
      },
    },
  });
  const credentials = { email: "other@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const { browser: otherBrowser } = await env.signIn(credentials);
  const refused = await otherBrowser.graphql(TASK_HISTORY, { id });
  expect(await refused.json()).toMatchObject({
    errors: [{ message: "You cannot read this history.", extensions: { code: "FORBIDDEN" } }],
  });
});

test("returns no task to an unrelated signed-in person", async ({ env }) => {
  await env.signInAsOwner();
  const assignee = await env.seed.employee();
  const asker = await env.seed.employee();
  const credentials = { email: "other@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const task = await env.seed.task({
    assigneeEmployeeId: assignee.id,
    askedByEmployeeId: asker.id,
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

const MARK_DONE_WITH_HISTORY = `mutation MarkDone($id: ID!) {
  tasks { markDone(input: { id: $id }) {
    task { id history(first: 5) { edges { node { operation } } } }
    historyLine {
      operation
      changes { field oldValue newValue }
      record { ... on Task { id access { canUpdate canDelete editableFields } } }
    }
    error { __typename ... on Error { message } }
  } }
}`;
const TASK_HISTORY = `query TaskHistory($id: ID!) {
  recordHistory(recordType: TASK, recordId: $id) { edges { node { operation } } }
}`;
