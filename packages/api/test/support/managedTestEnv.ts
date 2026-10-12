import { onTestFinished } from "vitest";

import { MANAGED_INSTANCE_ID, startFakeAccounts, type FakeAccounts } from "./fakeAccounts";
import { TestEnv, type TestEnvOptions } from "./testEnv";

/** Server options for a managed instance that trusts `accounts`. */
export function managedOptions(accounts: FakeAccounts): TestEnvOptions {
  return { managed: { instanceId: MANAGED_INSTANCE_ID, accountsUrl: accounts.url } };
}

/** A managed instance waiting for init, and its accounts service; both stop when the test ends. */
export async function startManagedEnv(): Promise<{ env: TestEnv; accounts: FakeAccounts }> {
  const accounts = await startFakeAccounts();
  onTestFinished(() => accounts.stop());
  const env = await TestEnv.start(managedOptions(accounts));
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
