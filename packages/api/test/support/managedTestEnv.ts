import { randomUUID } from "node:crypto";

import { onTestFinished } from "vitest";

import { createBrowser, type Browser } from "./browser";
import {
  MANAGED_ASSIGNMENT,
  MANAGED_INSTANCE_ID,
  startFakeAccounts,
  type FakeAccounts,
} from "./fakeAccounts";
import { TestEnv, type TestEnvOptions } from "./testEnv";

/** Server options for a managed instance that trusts `accounts`. */
export function managedOptions(accounts: FakeAccounts): TestEnvOptions {
  return { managed: { instanceId: MANAGED_INSTANCE_ID, accountsUrl: accounts.url } };
}

/** A managed instance waiting for init, and its accounts service; both stop when the test ends. */
export async function startManagedEnv(
  options: Omit<TestEnvOptions, "managed"> = {},
): Promise<{ env: TestEnv; accounts: FakeAccounts }> {
  const accounts = await startFakeAccounts();
  onTestFinished(() => accounts.stop());
  const env = await TestEnv.start({ ...options, ...managedOptions(accounts) });
  onTestFinished(() => env.stop());
  return { env, accounts };
}

/** Orchestration's `POST /api/init` with `token` as the bearer. */
export function postInit(env: TestEnv, token: string): Promise<Response> {
  return fetch(`${env.url}/api/init`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Assigns a managed instance and signs its owner in through the real ticket flow. */
export async function signInAsManagedOwner(env: TestEnv, accounts: FakeAccounts): Promise<Browser> {
  const init = await postInit(env, await accounts.signInit());
  if (init.status !== 200) throw new Error(`Managed init failed with ${init.status}`);
  const browser = createBrowser(env.url, MANAGED_ASSIGNMENT.publicOrigin);
  const start = await browser.getManual("/api/auth/managed/start");
  const location = start.headers.get("location");
  if (start.status !== 303 || !location) throw new Error("Managed sign-in did not start");
  const state = new URL(location).searchParams.get("state");
  if (!state) throw new Error("Managed sign-in state is missing");
  const ticket = await accounts.signTicket({
    sub: "subject-1",
    email: "owner@example.com",
    name: "Avery Stone",
    company: MANAGED_ASSIGNMENT.companyId,
    state,
    jti: randomUUID(),
  });
  const callback = await browser.postForm(
    "/api/auth/managed/callback",
    new URLSearchParams({ ticket }),
    MANAGED_ASSIGNMENT.websiteOrigin,
  );
  if (
    callback.status !== 303 ||
    callback.headers.get("location") !== `${MANAGED_ASSIGNMENT.publicOrigin}/`
  ) {
    throw new Error(`Managed sign-in failed with ${callback.status}`);
  }
  return browser;
}
