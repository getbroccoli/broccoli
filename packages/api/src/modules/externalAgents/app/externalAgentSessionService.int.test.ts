import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import {
  aiSettings,
  expect,
  externalAgentUseCases,
  NON_OWNER,
  OWNER,
  SETUP_EXTERNAL_AGENT,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

test("refuses choosing the agent through AI settings, which would keep its sessions", async ({
  orm,
}) => {
  const settings = aiSettings(orm);

  await expect(settings.save(SETUP_HOLDER, { source: "external_agent" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "source", code: "invalid" }],
  });
  expect(await settings.read(OWNER)).toEqual({ source: "broccoli_ai", openRouterKey: null });
});

test("allows exactly one of two parallel exchanges of a code", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);

  const exchanges = await Promise.allSettled([
    sessions.startExternalAgentSession(SYSTEM, { code, client: "First agent" }),
    sessions.startExternalAgentSession(SYSTEM, { code, client: "Second agent" }),
  ]);

  expect(exchanges.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(exchanges.filter(({ status }) => status === "rejected")).toMatchObject([
    { status: "rejected", reason: INVALID_CODE },
  ]);
});

test("refuses a wrong code", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);

  await expect(
    sessions.startExternalAgentSession(SYSTEM, { code: "wrong-code", client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("refuses a used code", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  await sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" });

  await expect(
    sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("exchanges a system-created code for a session only once", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCode(SYSTEM);

  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });

  expect(await sessions.readExternalAgentSession({ token })).not.toBeNull();
  await expect(
    sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("a system-created code ends the session from the setup holder's code", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  expect(await sessions.readExternalAgentSession({ token })).not.toBeNull();

  await sessions.createExternalAgentCode(SYSTEM);

  expect(await sessions.readExternalAgentSession({ token })).toBeNull();
});

test("refuses a code to the system before the external agent is chosen", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  await seed.aiSource("broccoli_ai");
  const { sessions } = externalAgentUseCases(orm);

  await expect(sessions.createExternalAgentCode(SYSTEM)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test("refuses a code at its two-hour deadline", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });
  const { code, expiresAt } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  expect(expiresAt).toEqual(new Date("2026-10-20T14:00:00Z"));
  now = expiresAt;

  await expect(
    sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test.for(["chooseExternalAgent", "createExternalAgentCode", "disconnectExternalAgent"] as const)(
  "%s cancels an unused code",
  async (operation, { orm, seed }) => {
    await seed.externalAgentSetup();
    const { sessions } = externalAgentUseCases(orm);
    const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);

    if (operation === "createExternalAgentCode")
      await sessions.createExternalAgentCode(SETUP_HOLDER);
    else await sessions[operation](SETUP_HOLDER);

    await expect(
      sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" }),
    ).rejects.toMatchObject(INVALID_CODE);
  },
);

test("exchanges a code for a session", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const issued = await sessions.createExternalAgentCode(SETUP_HOLDER);

  const session = await sessions.startExternalAgentSession(SYSTEM, {
    code: issued.code,
    client: "Test agent",
  });
  const ctx = await sessions.readExternalAgentSession({ token: session.token });

  expect(issued.code).toMatch(/^[\w-]{43}$/);
  expect(session.token).toMatch(/^[\w-]{43}$/);
  expect(session.expiresAt).toEqual(new Date("2026-10-20T14:00:00Z"));
  expect(ctx).not.toBeNull();
  expect(ctx!.isSystem).toBe(false);
  expect(ctx!.requireSetupExternalAgent()).toBe(ctx!.externalAgentSessionId);
  expect(await sessions.readExternalAgentConnection(SETUP_HOLDER)).toMatchObject({
    client: "Test agent",
    expiresAt: session.expiresAt,
  });
});

test("shows the external agent as listening right after it connects", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);

  await sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" });

  expect(await sessions.readExternalAgentConnection(SETUP_HOLDER)).toMatchObject({
    listening: true,
  });
});

test("shows the external agent as not listening 30 seconds after its last call", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  await sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" });

  now = new Date("2026-10-20T12:00:30Z");

  expect(await sessions.readExternalAgentConnection(SETUP_HOLDER)).toMatchObject({
    listening: false,
  });
});

test("shows the external agent as listening while a wait stays open past 30 seconds", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions, files } = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await sessions.readExternalAgentSession({ token }))!;
  const controller = new AbortController();

  const waiting = files.pollUnmappedFiles(ctx, { seconds: 60, signal: controller.signal });
  now = new Date("2026-10-20T12:00:45Z");

  try {
    expect(await sessions.readExternalAgentConnection(SETUP_HOLDER)).toMatchObject({
      listening: true,
    });
  } finally {
    controller.abort();
    await waiting;
  }
});

test("shows the external agent as listening again after a list call following a quiet stretch", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions, files } = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await sessions.readExternalAgentSession({ token }))!;
  now = new Date("2026-10-20T12:01:00Z");
  expect(await sessions.readExternalAgentConnection(SETUP_HOLDER)).toMatchObject({
    listening: false,
  });

  await files.listUnmappedFiles(ctx);

  expect(await sessions.readExternalAgentConnection(SETUP_HOLDER)).toMatchObject({
    listening: true,
  });
});

test.for([NON_OWNER, SETUP_EXTERNAL_AGENT])(
  "refuses a code to a caller without setup access",
  async (ctx, { orm, seed }) => {
    await seed.externalAgentSetup();
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createExternalAgentCode(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  },
);

test.for(["chooseExternalAgent", "createExternalAgentCode", "disconnectExternalAgent"] as const)(
  "%s refuses a managed instance",
  async (operation, { orm, seed }) => {
    await seed.externalAgentSetup();
    await seed.assignment();
    const { sessions } = externalAgentUseCases(orm);

    await expect(
      operation === "createExternalAgentCode"
        ? sessions.createExternalAgentCode(SETUP_HOLDER)
        : sessions[operation](SETUP_HOLDER),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  },
);

test.for(["owner", "ready", "done"] as const)(
  "refuses a code at the %s step",
  async (step, { orm, seed }) => {
    await seed.externalAgentSetup();
    await seed.setupStep(step);
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createExternalAgentCode(SETUP_HOLDER)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  },
);

test("stores only hashes of the code and token", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCode(SETUP_HOLDER);
  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });

  const codes = await orm.execute(sql`select * from external_agent_codes`);
  const sessionsAtRest = await orm.execute(sql`select * from external_agent_sessions`);

  expect(codes.rows).toMatchObject([
    { secret_hash: createHash("sha256").update(code).digest("hex") },
  ]);
  expect(sessionsAtRest.rows).toMatchObject([
    { token_hash: createHash("sha256").update(token).digest("hex") },
  ]);
  const stored = JSON.stringify([codes.rows, sessionsAtRest.rows]);
  expect(stored).not.toContain(code);
  expect(stored).not.toContain(token);
});

const INVALID_CODE = { code: "UNAUTHENTICATED", message: "The code is not valid." };
