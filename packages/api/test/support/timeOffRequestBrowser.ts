import { expect, onTestFinished } from "vitest";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import type { Browser } from "./browser";
import { TEST_OWNER, type TestEnv } from "./testEnv";
import { testTransactor } from "./testTransactor";
import { giveDefaultTermsStatutoryMinimum, readTermsPolicies } from "./timeOffService";

export async function signInEmployee(
  env: TestEnv,
  firstName: string,
  permissionProfiles: "ADMIN"[] = [],
) {
  const credentials = {
    email: firstName.toLowerCase() + "@example.com",
    password: TEST_OWNER.password,
  };
  const user = await env.seed.user({ ...credentials, permissionProfiles });
  const employee = await env.seed.employee({ firstName, userId: user.id, startDate: "2025-01-01" });
  const { browser } = await env.signIn(credentials);
  return { id: employee.id, browser };
}

export async function setUpRequests(env: TestEnv) {
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

/** Asks for time off as the browser's user. */
export const REQUEST_TIME_OFF = `mutation Request($input: TimeOffBookInput!) {
  timeOff { requestTimeOff(input: $input) { timeOff { id status cost } error { __typename } } }
}`;

/** Requests time off as the browser's user and returns its id, checking it waits for approval. */
export async function submitRequest(
  browser: Browser,
  input: Awaited<ReturnType<typeof setUpRequests>>["input"],
) {
  const result = await browser.graphql(REQUEST_TIME_OFF, { input });
  const body = (await result.json()) as {
    data: { timeOff: { requestTimeOff: { timeOff: { id: string } } } };
  };
  expect(body).toMatchObject({
    data: { timeOff: { requestTimeOff: { error: null, timeOff: { status: "REQUESTED" } } } },
  });
  return body.data.timeOff.requestTimeOff.timeOff.id;
}
