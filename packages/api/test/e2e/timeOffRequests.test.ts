import { afterEach, beforeEach, onTestFinished, vi } from "vitest";

import {
  expect,
  giveDefaultTermsStatutoryMinimum,
  readTermsPolicies,
  seedTimeOff,
  test,
  TEST_OWNER,
  testTransactor,
  type TestEnv,
  type Browser,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("requestTimeOff returns the request and its waiting figure", async ({ env }) => {
  const { amira, input } = await setUpRequests(env);

  const result = await amira.browser.graphql(REQUEST, { input });

  expect(await result.json()).toEqual({
    data: {
      timeOff: {
        requestTimeOff: {
          timeOff: { id: expect.any(String) as unknown, status: "REQUESTED", cost: 2.5 },
          error: null,
        },
      },
    },
  });
  const figures = await amira.browser.graphql(
    "query Figures($id: ID!) { employee(id: $id) { timeOffTypes { waiting remaining } } }",
    { id: amira.id },
  );
  expect(await figures.json()).toEqual({
    data: { employee: { timeOffTypes: [{ waiting: 2.5, remaining: 20 }] } },
  });
});

test("the calendar shows waiting leave to the manager and admin and approved leave to colleagues", async ({
  env,
}) => {
  const { amira, rachel, orm, input } = await setUpRequests(env);
  const hannah = await signInEmployee(env, "Hannah", ["ADMIN"]);
  const ben = await signInEmployee(env, "Ben");
  for (const [status, date] of [
    ["requested", "2026-12-07"],
    ["approved", "2026-12-08"],
    ["rejected", "2026-12-09"],
    ["cancelled", "2026-12-10"],
  ] as const) {
    const decision =
      status === "approved" || status === "rejected"
        ? {
            decidedAt: new Date("2026-11-26T09:00:00Z"),
            decidedByEmployeeId: rachel.id,
            decisionComment: status === "approved" ? "Cover arranged." : "Release week.",
          }
        : {};
    await seedTimeOff(orm, {
      ...input,
      status,
      ...decision,
      requestedAt: new Date("2026-11-25T12:00:00Z"),
      days: [{ date, dayPart: "full_day" }],
    });
  }
  const calendar = `query Calendar($id: ID!) { employee(id: $id) {
    whosOut(from: "2026-12-07", until: "2026-12-10") { timeOff { days { date } status decision { comment } } }
  } }`;
  for (const { browser } of [rachel, hannah]) {
    const response = await browser.graphql(calendar, { id: amira.id });
    expect(await response.json()).toEqual({
      data: {
        employee: {
          whosOut: {
            timeOff: [
              { days: [{ date: "2026-12-07" }], status: "REQUESTED", decision: null },
              {
                days: [{ date: "2026-12-08" }],
                status: "APPROVED",
                decision: { comment: "Cover arranged." },
              },
            ],
          },
        },
      },
    });
  }
  const peer = await ben.browser.graphql(calendar, { id: amira.id });
  expect(await peer.json()).toEqual({
    data: {
      employee: {
        whosOut: { timeOff: [{ days: [{ date: "2026-12-08" }], status: null, decision: null }] },
      },
    },
  });
});

test("lists waiting and decided requests in the open leave years, newest request first", async ({
  env,
}) => {
  const { amira, rachel, input, orm } = await setUpRequests(env);
  const ben = await signInEmployee(env, "Ben");
  const decision = {
    decidedAt: new Date("2026-11-25T10:00:00Z"),
    decidedByEmployeeId: rachel.id,
    decisionComment: "Release week.",
  };
  await seedTimeOff(orm, {
    ...input,
    status: "rejected",
    requestedAt: new Date("2026-11-24T08:00:00Z"),
    ...decision,
    days: [{ date: "2026-12-15", dayPart: "full_day" }],
  });
  await seedTimeOff(orm, {
    ...input,
    status: "approved",
    days: [{ date: "2026-12-10", dayPart: "full_day" }],
  });
  await seedTimeOff(orm, {
    ...input,
    status: "rejected",
    requestedAt: new Date("2025-11-24T08:00:00Z"),
    ...decision,
    days: [{ date: "2025-12-15", dayPart: "full_day" }],
  });
  await seedTimeOff(orm, {
    ...input,
    status: "requested",
    requestedAt: new Date("2026-11-26T08:00:00Z"),
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const query = `query Requests($id: ID!) { employee(id: $id) {
    timeOffRequests { days { date } status decision { decidedBy { id } decidedAt comment } }
  } }`;

  const own = await amira.browser.graphql(query, { id: amira.id });
  const peer = await ben.browser.graphql(query, { id: amira.id });

  expect(await own.json()).toEqual({
    data: {
      employee: {
        timeOffRequests: [
          { days: [{ date: "2027-01-04" }], status: "REQUESTED", decision: null },
          {
            days: [{ date: "2026-12-15" }],
            status: "REJECTED",
            decision: {
              decidedBy: { id: rachel.id },
              decidedAt: decision.decidedAt.toISOString(),
              comment: decision.decisionComment,
            },
          },
        ],
      },
    },
  });
  expect(await peer.json()).toEqual({ data: { employee: { timeOffRequests: null } } });
});

test("only admins have delete access to the request and nobody can edit it", async ({ env }) => {
  const { amira, rachel, input } = await setUpRequests(env);
  const hannah = await signInEmployee(env, "Hannah", ["ADMIN"]);
  await submitRequest(amira.browser, input);
  const query = `query Access($id: ID!) { employee(id: $id) {
    timeOffRequests { ... on AnyRecord { access { canDelete canUpdate editableFields } } }
  } }`;

  for (const [reader, canDelete] of [
    [amira, false],
    [rachel, false],
    [hannah, true],
  ] as const) {
    const response = await reader.browser.graphql(query, { id: amira.id });
    expect(await response.json()).toEqual({
      data: {
        employee: {
          timeOffRequests: [{ access: { canDelete, canUpdate: false, editableFields: [] } }],
        },
      },
    });
  }
});

test("records creation, approval and cancellation in the request history", async ({ env }) => {
  const { amira, rachel, input } = await setUpRequests(env);
  const hannah = await signInEmployee(env, "Hannah", ["ADMIN"]);
  const timeOffId = await submitRequest(amira.browser, input);
  const list = await rachel.browser.graphql("{ myTasks { needsYou { id } } }");
  const { data } = (await list.json()) as { data: { myTasks: { needsYou: { id: string }[] } } };
  const done = await rachel.browser.graphql(
    `mutation Approve($id: ID!) {
    tasks { markDone(input: { id: $id, result: { code: "approved" } }) { error { __typename } } }
  }`,
    { id: data.myTasks.needsYou[0]!.id },
  );
  expect(await done.json()).toEqual({ data: { tasks: { markDone: { error: null } } } });
  const cancel = await hannah.browser.graphql(
    `mutation Cancel($id: ID!) {
    timeOff { cancelTimeOff(input: { timeOffId: $id }) { error { __typename } } }
  }`,
    { id: timeOffId },
  );
  expect(await cancel.json()).toEqual({ data: { timeOff: { cancelTimeOff: { error: null } } } });

  const history = await amira.browser.graphql(
    `query History($id: ID!) { employee(id: $id) {
    timeOffRequests { history { edges { node { operation } } } }
  } }`,
    { id: amira.id },
  );
  expect(await history.json()).toEqual({
    data: {
      employee: {
        timeOffRequests: [
          {
            history: {
              edges: [
                { node: { operation: "UPDATED" } },
                { node: { operation: "UPDATED" } },
                { node: { operation: "CREATED" } },
              ],
            },
          },
        ],
      },
    },
  });
});

test("refuses the direct record history query for a colleague's request", async ({ env }) => {
  const { amira, input } = await setUpRequests(env);
  const id = await submitRequest(amira.browser, input);
  const ben = await signInEmployee(env, "Ben");

  const result = await ben.browser.graphql(
    `query History($id: ID!) {
    recordHistory(recordType: TIME_OFF, recordId: $id) { edges { node { operation } } }
  }`,
    { id },
  );

  expect(await result.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

const REQUEST = `mutation Request($input: TimeOffBookInput!) {
  timeOff { requestTimeOff(input: $input) { timeOff { id status cost } error { __typename } } }
}`;

async function submitRequest(
  browser: Browser,
  input: Awaited<ReturnType<typeof setUpRequests>>["input"],
) {
  const result = await browser.graphql(REQUEST, { input });
  const body = (await result.json()) as {
    data: { timeOff: { requestTimeOff: { timeOff: { id: string } } } };
  };
  expect(body).toMatchObject({
    data: { timeOff: { requestTimeOff: { error: null, timeOff: { status: "REQUESTED" } } } },
  });
  return body.data.timeOff.requestTimeOff.timeOff.id;
}

async function signInEmployee(env: TestEnv, firstName: string, permissionProfiles: "ADMIN"[] = []) {
  const credentials = {
    email: firstName.toLowerCase() + "@example.com",
    password: TEST_OWNER.password,
  };
  const user = await env.seed.user({ ...credentials, permissionProfiles });
  const employee = await env.seed.employee({ firstName, userId: user.id, startDate: "2025-01-01" });
  const { browser } = await env.signIn(credentials);
  return { id: employee.id, browser };
}

async function setUpRequests(env: TestEnv) {
  await env.seed.owner();
  const amira = await signInEmployee(env, "Amira");
  const rachel = await signInEmployee(env, "Rachel");
  await env.seed.manager(amira.id, rachel.id);
  const database = connectDatabase(env.db.url, createLogger("silent"));
  onTestFinished(() => database.close());
  const { orm } = database;
  await giveDefaultTermsStatutoryMinimum(orm, env.seed, testTransactor(orm));
  const [annual] = await readTermsPolicies(orm, await env.seed.defaultTermsId());
  const input = {
    employeeId: amira.id,
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "MORNING" }],
  };
  return { amira, rachel, orm, input };
}
