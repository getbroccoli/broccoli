import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { MANAGED_ASSIGNMENT, type FakeAccounts } from "./fakeAccounts";
import { postInit, startManagedEnv } from "./managedTestEnv";
import type { TestEnv } from "./testEnv";

const STATE_COOKIE = "__Host-managed_state";
const RETURN_COOKIE = "__Host-managed_return";
const { companyId, websiteOrigin } = MANAGED_ASSIGNMENT;

/** A managed instance already assigned by init. */
export async function assignedManagedEnv(): Promise<{ env: TestEnv; accounts: FakeAccounts }> {
  const { env, accounts } = await startManagedEnv();
  expect((await postInit(env, await accounts.signInit())).status).toBe(200);
  return { env, accounts };
}

/**
 * `/start` as the browser calls it: returns the state its cookie carries, and the cookie saying
 * where to return when it set one.
 */
export async function startManagedSignIn(
  env: TestEnv,
  query = "",
): Promise<{ state: string; location: URL; cookie: string; returnCookie: string | undefined }> {
  const response = await fetch(`${env.url}/api/auth/managed/start${query}`, { redirect: "manual" });
  expect(response.status).toBe(303);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.find((value) => value.startsWith(`${STATE_COOKIE}=`))!;
  const state = cookie.slice(STATE_COOKIE.length + 1).split(";", 1)[0]!;
  const returnCookie = cookies
    .find((value) => value.startsWith(`${RETURN_COOKIE}=`) && !/Max-Age=0/i.test(value))
    ?.split(";", 1)[0];
  return { state, location: new URL(response.headers.get("location")!), cookie, returnCookie };
}

export function managedTicketClaims(state: string, overrides: Record<string, unknown> = {}) {
  return {
    sub: "subject-1",
    email: "owner@example.com",
    name: "Ada Owner",
    company: companyId,
    state,
    jti: randomUUID(),
    ...overrides,
  };
}

/** The website's form POST of `ticket`, with the browser's state cookie and any `cookies`. */
export function postManagedTicket(
  env: TestEnv,
  ticket: string,
  state: string | null,
  origin: string | null = websiteOrigin,
  cookies: readonly string[] = [],
) {
  const cookie = [...(state ? [`${STATE_COOKIE}=${state}`] : []), ...cookies].join("; ");
  return fetch(`${env.url}/api/auth/managed/callback`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(origin === null ? {} : { origin }),
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams({ ticket }).toString(),
  });
}

export function sessionCookieOf(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="))
    ?.split(";", 1)[0];
}
