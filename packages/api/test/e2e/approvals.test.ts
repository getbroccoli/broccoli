import { onTestFinished } from "vitest";

import {
  approvalRequest,
  approvalService,
  approvalToday,
  approveReviewedImport,
  taskService,
  createBrowser,
  MANAGED_ASSIGNMENT,
  transactWithApprovals,
  signedIn,
  signInAsManagedOwner,
  test,
  startManagedEnv,
  TEST_OWNER,
  type TestEnv,
  expect,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("the manager and requester both see who rejected the task and why", async () => {
  const { env, accounts } = await startManagedEnv();
  const owner = await signInAsManagedOwner(env, accounts);
  expect(await (await approveReviewedImport(owner)).json()).toMatchObject({
    data: { imports: { approve: { error: null } } },
  });
  const sam = await signInEmployee(env, "Sam");
  const mia = await signInEmployee(env, "Mia");
  await env.seed.manager(sam.id, mia.id);
  const db = connectDatabase(env.db.url, createLogger("silent"));
  onTestFinished(() => db.close());
  const requester = signedIn(db.orm, { employeeId: sam.id, profiles: ["EMPLOYEE"] });
  const transact = transactWithApprovals(db.orm, { today: approvalToday });
  await transact((tx) =>
    approvalService(db.orm).requestApproval(requester, tx, approvalRequest(sam.id)),
  );
  const {
    waitingOnOthers: [task],
  } = await taskService(db.orm).listMyTasks(requester);
  const id = task!.id;
  const comment = "Clashes with the release week.";

  const decision = await mia.browser.graphql(
    `mutation Reject($id: ID!, $comment: String!) {
    tasks { markDone(input: { id: $id, result: { code: "rejected", comment: $comment } }) {
      task { id } error { __typename }
    } }
  }`,
    { id, comment },
  );
  expect(await decision.json()).toEqual({
    data: { tasks: { markDone: { task: { id }, error: null } } },
  });

  for (const reader of [mia, sam]) {
    const response = await reader.browser.graphql(
      `query Task($id: ID!) {
      task(id: $id) { processRun { status outcome { label comment decidedBy { id } } } }
    }`,
      { id },
    );
    expect(await response.json()).toEqual({
      data: {
        task: {
          processRun: {
            status: "FINISHED",
            outcome: { label: "Rejected", comment, decidedBy: { id: mia.id } },
          },
        },
      },
    });
  }
});

async function signInEmployee(env: TestEnv, firstName: string) {
  const credentials = {
    email: `${firstName.toLowerCase()}@example.com`,
    password: TEST_OWNER.password,
  };
  const user = await env.seed.user(credentials);
  const employee = await env.seed.employee({
    firstName,
    email: credentials.email,
    userId: user.id,
  });
  const browser = createBrowser(env.url, MANAGED_ASSIGNMENT.publicOrigin);
  expect((await browser.post("/api/auth/sign-in/email", credentials)).status).toBe(200);
  return { id: employee.id, browser };
}
