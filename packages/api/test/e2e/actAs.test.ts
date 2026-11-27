import { onTestFinished, vi } from "vitest";

import {
  type Browser,
  expect,
  signInAsManagedOwner,
  signInEmployee,
  startManagedEnv,
  submitRequest,
  test,
  TEST_OWNER,
  type TestEnv,
} from "#test/support";

test("an admin acting as an employee reads that employee's rights under their own sign-in", async ({
  env,
}) => {
  const { browser, user } = await signInAdmin(env);
  const employee = await env.seed.employee();

  await startActing(browser, employee.id);

  const response = await browser.graphql(`{ me {
    id email employee { id } actingAs { id } permissionProfiles isOwner operations
  } }`);
  expect(await response.json()).toEqual({
    data: {
      me: {
        id: user.id,
        email: user.email,
        employee: { id: employee.id },
        actingAs: { id: employee.id },
        permissionProfiles: ["EMPLOYEE"],
        isOwner: false,
        operations: [],
      },
    },
  });
});

test("an admin sees they may act as a colleague and may not act as themselves", async ({ env }) => {
  const { browser, employee: admin } = await signInAdmin(env);
  const colleague = await env.seed.employee();

  const response = await browser.graphql(
    `query Employees($own: ID!, $other: ID!) {
    own: employee(id: $own) { canActAs }
    colleague: employee(id: $other) { canActAs }
  }`,
    { own: admin.id, other: colleague.id },
  );

  expect(await response.json()).toEqual({
    data: { own: { canActAs: false }, colleague: { canActAs: true } },
  });
});

test("stopping restores the admin's own employee and profiles", async ({ env }) => {
  const { browser, employee: admin } = await signInAdmin(env);
  const employee = await env.seed.employee();
  await startActing(browser, employee.id);

  const stopped = await browser.post("/api/auth/act-as/stop", {});
  expect(stopped.status).toBe(200);
  expect(await stopped.json()).toEqual({});

  const response = await browser.graphql(
    "{ me { employee { id } actingAs { id } permissionProfiles } }",
  );
  expect(await response.json()).toEqual({
    data: {
      me: {
        employee: { id: admin.id },
        actingAs: null,
        permissionProfiles: ["EMPLOYEE", "ADMIN"],
      },
    },
  });
});

test("refusing to act as an unrelated colleague keeps the employee's own session", async ({
  env,
}) => {
  await env.seed.owner();
  const { browser } = await signInEmployee(env, "Casey");
  const colleague = await env.seed.employee();

  const refused = await browser.post("/api/auth/act-as", { employeeId: colleague.id });

  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "NOT_ALLOWED_TO_ACT_AS" });
  const response = await browser.graphql("{ me { actingAs { id } } }");
  expect(await response.json()).toEqual({ data: { me: { actingAs: null } } });
});

test("refuses starting to act again while acting", async ({ env }) => {
  const { browser } = await signInAdmin(env);
  const joined = await env.seed.user({ email: "casey@example.com", permissionProfiles: ["ADMIN"] });
  const employee = await env.seed.employee({ userId: joined.id });
  const other = await env.seed.employee();
  await startActing(browser, employee.id);

  const refused = await browser.post("/api/auth/act-as", { employeeId: other.id });

  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "ACTING_AS_EMPLOYEE" });
});

test("refuses password reset requests while acting", async ({ env }) => {
  const { browser, user } = await signInAdmin(env);
  const employee = await env.seed.employee();
  await startActing(browser, employee.id);

  const refused = await browser.post("/api/auth/request-password-reset", { email: user.email });

  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "ACTING_AS_EMPLOYEE" });
});

test("a moved report ends acting on the first refused auth request", async ({ env }) => {
  await env.seed.owner();
  const manager = await signInEmployee(env, "Robin");
  const report = await env.seed.employee();
  const otherManager = await env.seed.employee();
  await env.seed.manager(report.id, manager.id);
  await startActing(manager.browser, report.id);
  await env.seed.manager(report.id, otherManager.id);

  const refused = await manager.browser.get("/api/auth/list-sessions");
  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "ACTING_AS_EMPLOYEE" });

  const allowed = await manager.browser.get("/api/auth/list-sessions");
  expect(allowed.status).toBe(200);
});

test("acting returns the acting refusal for a consent update", async ({ env }) => {
  const { browser } = await signInAdmin(env);
  const employee = await env.seed.employee();
  await startActing(browser, employee.id);

  const refused = await browser.post("/api/auth/oauth2/update-consent", {
    id: "consent",
    update: { scopes: ["broccoli:read"] },
  });

  expect(refused.status).toBe(403);
  expect(await refused.json()).toMatchObject({ code: "ACTING_AS_EMPLOYEE" });
});

test("changing permission profiles while acting returns a top-level forbidden error", async ({
  env,
}) => {
  const { browser, employee: admin } = await signInAdmin(env);
  const joined = await env.seed.user({ email: "casey@example.com", permissionProfiles: ["ADMIN"] });
  const employee = await env.seed.employee({ userId: joined.id });
  await startActing(browser, employee.id);

  const response = await browser.graphql(
    `mutation ChangeProfiles($id: ID!) {
    employees { setPermissionProfiles(input: { id: $id, profiles: [] }) { employee { id } error { __typename } } }
  }`,
    { id: admin.id },
  );

  expect(await response.json()).toMatchObject({
    errors: [
      { message: "Stop acting as someone else to do this.", extensions: { code: "FORBIDDEN" } },
    ],
  });
});

test("signing out ends acting before the next sign-in", async ({ env }) => {
  const { browser, user } = await signInAdmin(env);
  const employee = await env.seed.employee();
  await startActing(browser, employee.id);

  expect((await browser.post("/api/auth/sign-out", {})).status).toBe(200);
  const signedOut = await browser.graphql("{ me { id } }");
  expect(await signedOut.json()).toEqual({ data: { me: null } });
  expect(
    (
      await browser.post("/api/auth/sign-in/email", {
        email: user.email,
        password: TEST_OWNER.password,
      })
    ).status,
  ).toBe(200);

  const response = await browser.graphql("{ me { id actingAs { id } } }");
  expect(await response.json()).toEqual({ data: { me: { id: user.id, actingAs: null } } });
});

test("the self-hosted demo owner sees an unjoined employee's tasks and requests leave for them", async ({
  env,
}) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { browser } = await env.startDemo();
  const employeeId = await demoEmployeeId(browser);
  await startActing(browser, employeeId);

  const tasks = await browser.graphql("{ myTasks { needsYou { title assignee { id } } } }");
  expect(await tasks.json()).toEqual({
    data: {
      myTasks: {
        needsYou: [
          { title: "Check the laptop budget for new starters", assignee: { id: employeeId } },
        ],
      },
    },
  });
  const types = await browser.graphql(
    `query Types($id: ID!) {
    employee(id: $id) { timeOffTypes { timeOffType { id typeKey } } }
  }`,
    { id: employeeId },
  );
  const { data } = (await types.json()) as {
    data: {
      employee: {
        timeOffTypes: { timeOffType: { id: string; typeKey: string | null } }[];
      };
    };
  };
  const annual = data.employee.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE",
  );
  expect(annual).toBeDefined();
  const id = await submitRequest(browser, {
    employeeId,
    timeOffTypeId: annual!.timeOffType.id,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
    halfDays: [],
  });

  expect((await browser.post("/api/auth/act-as/stop", {})).status).toBe(200);
  const requests = await browser.graphql(
    `query Requests($id: ID!) {
    me { actingAs { id } isOwner }
    employee(id: $id) { timeOffRequests { id status } }
  }`,
    { id: employeeId },
  );
  expect(await requests.json()).toEqual({
    data: {
      me: { actingAs: null, isOwner: true },
      employee: { timeOffRequests: [{ id, status: "REQUESTED" }] },
    },
  });
});

test("a managed demo owner may act as a seeded employee", async () => {
  const { env, accounts } = await startManagedEnv();
  const browser = await signInAsManagedOwner(env, accounts);
  await browser.graphql(
    'mutation { company { update(input: { name: "Acme Corp" }) { company { id } } } }',
  );
  const demo = await browser.graphql("mutation { imports { startDemo { import { id } } } }");
  expect(await demo.json()).toEqual({
    data: { imports: { startDemo: { import: { id: "import" } } } },
  });
  const id = await demoEmployeeId(browser);

  await startActing(browser, id);

  const response = await browser.graphql("{ me { actingAs { id } } }");
  expect(await response.json()).toEqual({ data: { me: { actingAs: { id } } } });
});

async function signInAdmin(env: TestEnv) {
  await env.seed.owner();
  const credentials = { email: "admin@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user({ ...credentials, permissionProfiles: ["ADMIN"] });
  const employee = await env.seed.employee({ userId: user.id });
  const { browser } = await env.signIn(credentials);
  return { browser, user, employee };
}

async function startActing(browser: Browser, employeeId: string) {
  const response = await browser.post("/api/auth/act-as", { employeeId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ employeeId });
}

async function demoEmployeeId(browser: Browser) {
  const response = await browser.graphql(`{
    employees(filter: { search: "priya.shah@example.com" }) { edges { node { id permissionProfiles } } }
  }`);
  const body = (await response.json()) as {
    data: { employees: { edges: { node: { id: string } }[] } };
  };
  expect(body).toMatchObject({
    data: { employees: { edges: [{ node: { permissionProfiles: null } }] } },
  });
  return body.data.employees.edges[0]!.node.id;
}
