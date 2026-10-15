import { randomUUID } from "node:crypto";

import {
  expect,
  MANAGED_ASSIGNMENT,
  managedOptions,
  postInit,
  startManagedEnv,
  signInAsManagedOwner,
  TestEnv,
  test,
  type FakeAccounts,
} from "#test/support";

const STATE_COOKIE = "__Host-managed_state";
const { publicOrigin, websiteOrigin, companyId } = MANAGED_ASSIGNMENT;

const SIGN_IN_REQUIRED = `${publicOrigin}/login?error=sign_in_required`;

test.each(["google", "email"])(
  "start sets the state cookie and forwards method %s to the website",
  async (method) => {
    const { env } = await assignedEnv();

    const { state, location, cookie } = await start(env, `?method=${method}`);

    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/;\s*Path=\/(?:;|$)/i);
    expect(cookie).toMatch(/;\s*Max-Age=300(?:;|$)/i);
    expect(cookie).not.toMatch(/;\s*Domain=/i);
    expect(location.origin + location.pathname).toBe(`${websiteOrigin}/api/auth/managed/entry`);
    expect(Object.fromEntries(location.searchParams)).toEqual({
      company: companyId,
      state,
      method,
    });
  },
);

test("start drops an unknown method", async () => {
  const { env } = await assignedEnv();

  const { location } = await start(env, "?method=password");

  expect(location.searchParams.has("method")).toBe(false);
});

test("the first ticket creates the owner and signs them in", async () => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);

  const response = await postTicket(env, await accounts.signTicket(ticketClaims(state)), state);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`${publicOrigin}/`);
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^__Host-managed_state=;.*Max-Age=0/i)]),
  );
  const cookie = sessionCookie(response)!;
  expect(cookie).toBeDefined();
  expect((await me(env, cookie)).data).toEqual({
    me: { isOwner: true },
    setup: { step: "COMPANY", signIn: "MANAGED" },
  });
});

test("refuses a replayed ticket", async () => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);
  const ticket = await accounts.signTicket(ticketClaims(state));
  await postTicket(env, ticket, state);

  const replay = await postTicket(env, ticket, state);

  expect(replay.status).toBe(303);
  expect(replay.headers.get("location")).toBe(SIGN_IN_REQUIRED);
  expect(sessionCookie(replay)).toBeUndefined();
  expect(replay.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^__Host-managed_state=;.*Max-Age=0/i)]),
  );
});

test("refuses a ticket for another audience", async () => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);

  const response = await postTicket(
    env,
    await accounts.signTicket(ticketClaims(state), { audience: "https://other.example.com" }),
    state,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
  expect(sessionCookie(response)).toBeUndefined();
});

test("refuses an init token posted as a ticket", async () => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);

  const response = await postTicket(env, await accounts.signInit(), state);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
});

test.each([
  ["state", { state: "b".repeat(64) }],
  ["company", { company: "c-other" }],
])("refuses a ticket with the wrong %s", async (_claim, overrides) => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);

  const response = await postTicket(
    env,
    await accounts.signTicket(ticketClaims(state, overrides)),
    state,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
});

test("refuses a ticket without the state cookie", async () => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);

  const response = await postTicket(env, await accounts.signTicket(ticketClaims(state)), null);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
});

test.each(["https://evil.example.com", "https://www.example.com.evil.example.com", "null", null])(
  "refuses a ticket posted from origin %s",
  async (origin) => {
    const { env, accounts } = await assignedEnv();
    const { state } = await start(env);

    const response = await postTicket(
      env,
      await accounts.signTicket(ticketClaims(state)),
      state,
      origin,
    );

    if (response.status === 303) {
      expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    expect(sessionCookie(response)).toBeUndefined();
  },
);

test("signs a returning owner in with a new ticket", async () => {
  const { env, accounts } = await startManagedEnv();
  await signInAsManagedOwner(env, accounts);

  const second = await start(env);
  const response = await postTicket(
    env,
    await accounts.signTicket(ticketClaims(second.state)),
    second.state,
  );

  expect((await me(env, sessionCookie(response)!)).data.me).toEqual({ isOwner: true });
});

test("redirects to sign-in unavailable when the issuer's keys cannot be read", async () => {
  const { env, accounts } = await assignedEnv();
  const { state } = await start(env);
  const ticket = await accounts.signTicket(ticketClaims(state));
  await env.restart(managedOptions(accounts));
  await accounts.stop();

  const response = await postTicket(env, ticket, state);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`${publicOrigin}/login?error=sign_in_unavailable`);
  expect(sessionCookie(response)).toBeUndefined();
});

test("has no self-hosted setup", async () => {
  const { env } = await assignedEnv();

  const response = await fetch(`${env.url}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: publicOrigin },
    body: JSON.stringify({}),
  });

  expect(response.status).toBe(404);
});

/** A managed instance already assigned by init. */
async function assignedEnv(): Promise<{ env: TestEnv; accounts: FakeAccounts }> {
  const { env, accounts } = await startManagedEnv();
  expect((await postInit(env, await accounts.signInit())).status).toBe(200);
  return { env, accounts };
}

/** `/start` as the browser calls it: returns the state its cookie carries. */
async function start(
  env: TestEnv,
  query = "",
): Promise<{ state: string; location: URL; cookie: string }> {
  const response = await fetch(`${env.url}/api/auth/managed/start${query}`, { redirect: "manual" });
  expect(response.status).toBe(303);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${STATE_COOKIE}=`))!;
  const state = cookie.slice(STATE_COOKIE.length + 1).split(";", 1)[0]!;
  return { state, location: new URL(response.headers.get("location")!), cookie };
}

function ticketClaims(state: string, overrides: Record<string, unknown> = {}) {
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

/** The website's form POST of `ticket`. */
function postTicket(
  env: TestEnv,
  ticket: string,
  state: string | null,
  origin: string | null = websiteOrigin,
) {
  return fetch(`${env.url}/api/auth/managed/callback`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(origin === null ? {} : { origin }),
      ...(state ? { cookie: `${STATE_COOKIE}=${state}` } : {}),
    },
    body: new URLSearchParams({ ticket }).toString(),
  });
}

function sessionCookie(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="))
    ?.split(";", 1)[0];
}

async function me(env: TestEnv, cookie: string) {
  const response = await fetch(`${env.url}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ query: "{ me { isOwner } setup { step signIn } }" }),
  });
  return (await response.json()) as {
    data: { me: { isOwner: boolean } | null; setup: { step: string; signIn: string } };
  };
}
