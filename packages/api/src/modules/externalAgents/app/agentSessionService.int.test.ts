import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import {
  expect,
  externalAgentUseCases,
  NON_OWNER,
  SETUP_AGENT,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

import { instanceRepository } from "../../../core/instance";

test("allows exactly one of two parallel exchanges of a code", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createAgentCode(SETUP_HOLDER, CODE);

  const exchanges = await Promise.allSettled([
    sessions.startAgentSession(SYSTEM, { code, client: "First agent" }),
    sessions.startAgentSession(SYSTEM, { code, client: "Second agent" }),
  ]);

  expect(exchanges.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(exchanges.filter(({ status }) => status === "rejected")).toMatchObject([
    { status: "rejected", reason: INVALID_CODE },
  ]);
});

test("refuses a wrong code", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);

  await expect(
    sessions.startAgentSession(SYSTEM, { code: "wrong-code", client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("refuses a used code", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createAgentCode(SETUP_HOLDER, CODE);
  await sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });

  await expect(
    sessions.startAgentSession(SYSTEM, { code, client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("refuses a code at its two-hour deadline", async ({ orm, seed }) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });
  const { code, expiresAt } = await sessions.createAgentCode(SETUP_HOLDER, CODE);
  expect(expiresAt).toEqual(new Date("2026-10-20T14:00:00Z"));
  now = expiresAt;

  await expect(
    sessions.startAgentSession(SYSTEM, { code, client: "Test agent" }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test.for(["chooseAgent", "createAgentCode", "disconnectAgent"] as const)(
  "%s cancels an unused code",
  async (operation, { orm, seed }) => {
    await seed.agentSetup();
    const { sessions } = externalAgentUseCases(orm);
    const { code } = await sessions.createAgentCode(SETUP_HOLDER, CODE);

    if (operation === "createAgentCode") await sessions.createAgentCode(SETUP_HOLDER, CODE);
    else await sessions[operation](SETUP_HOLDER);

    await expect(
      sessions.startAgentSession(SYSTEM, { code, client: "Test agent" }),
    ).rejects.toMatchObject(INVALID_CODE);
  },
);

test.for(["answers_masked_questions", "parses_original_files"] as const)(
  "exchanges a code for a session with its %s way",
  async (way, { orm, seed }) => {
    await seed.agentSetup();
    const { sessions } = externalAgentUseCases(orm);
    const issued = await sessions.createAgentCode(SETUP_HOLDER, { ...CODE, way });

    const session = await sessions.startAgentSession(SYSTEM, {
      code: issued.code,
      client: "Test agent",
    });
    const ctx = await sessions.readAgentSession({ token: session.token });

    expect(issued.code).toMatch(/^[\w-]{43}$/);
    expect(issued.way).toBe(way);
    expect(session.token).toMatch(/^[\w-]{43}$/);
    expect(session).toMatchObject({
      way,
      expiresAt: new Date("2026-10-20T14:00:00Z"),
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.isSystem).toBe(false);
    expect(ctx!.requireSetupAgent()).toBe(ctx!.agentSessionId);
    expect(await sessions.readAgentConnection(SETUP_HOLDER)).toMatchObject({
      client: "Test agent",
      way,
      expiresAt: session.expiresAt,
    });
  },
);

test.for([NON_OWNER, SETUP_AGENT])(
  "refuses a code to a caller without setup access",
  async (ctx, { orm, seed }) => {
    await seed.agentSetup();
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createAgentCode(ctx, CODE)).rejects.toMatchObject({ code: "FORBIDDEN" });
  },
);

test.for(["chooseAgent", "createAgentCode", "disconnectAgent"] as const)(
  "%s refuses a managed instance",
  async (operation, { orm, seed }) => {
    await seed.agentSetup();
    await instanceRepository(orm).setAssignment({
      companyId: "company-1",
      publicOrigin: "https://broccoli.example.com",
      websiteOrigin: "https://example.com",
    });
    const { sessions } = externalAgentUseCases(orm);

    await expect(
      operation === "createAgentCode"
        ? sessions.createAgentCode(SETUP_HOLDER, CODE)
        : sessions[operation](SETUP_HOLDER),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  },
);

test.for(["company", "owner", "ready", "done"] as const)(
  "refuses a code at the %s step",
  async (step, { orm, seed }) => {
    await seed.agentSetup();
    await instanceRepository(orm).advanceStep("import", step);
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createAgentCode(SETUP_HOLDER, CODE)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  },
);

test("stores only hashes of the code and token", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });

  const codes = await orm.execute(sql`select * from agent_codes`);
  const sessionsAtRest = await orm.execute(sql`select * from agent_sessions`);

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

test("returns only the newest waiting code's way and expiry", async ({ orm, seed }) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });
  await sessions.createAgentCode(SETUP_HOLDER, CODE);
  now = new Date("2026-10-20T12:01:00Z");
  const { way, expiresAt } = await sessions.createAgentCode(SETUP_HOLDER, {
    ...CODE,
    way: "parses_original_files",
  });

  const pending = await sessions.readPendingAgentCode(SETUP_HOLDER);

  expect(pending).toEqual({ way, expiresAt });
});

test("returns no pending code before one is created", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);

  expect(await sessions.readPendingAgentCode(SETUP_HOLDER)).toBeNull();
});

test("returns no pending code once it is exchanged", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);
  const { code } = await sessions.createAgentCode(SETUP_HOLDER, CODE);

  await sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });

  expect(await sessions.readPendingAgentCode(SETUP_HOLDER)).toBeNull();
});

test("returns no pending code at its expiry", async ({ orm, seed }) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });
  const { expiresAt } = await sessions.createAgentCode(SETUP_HOLDER, CODE);

  now = expiresAt;

  expect(await sessions.readPendingAgentCode(SETUP_HOLDER)).toBeNull();
});

test("returns no pending code after Disconnect", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);
  await sessions.createAgentCode(SETUP_HOLDER, CODE);

  await sessions.disconnectAgent(SETUP_HOLDER);

  expect(await sessions.readPendingAgentCode(SETUP_HOLDER)).toBeNull();
});

test("returns no pending code when setup is no longer open to the agent", async ({ orm, seed }) => {
  await seed.agentSetup();
  const { sessions } = externalAgentUseCases(orm);
  await sessions.createAgentCode(SETUP_HOLDER, CODE);

  await instanceRepository(orm).advanceStep("import", "owner");

  expect(await sessions.readPendingAgentCode(SETUP_HOLDER)).toBeNull();
});

test.for([NON_OWNER, SETUP_AGENT])(
  "refuses to read the pending code without setup access",
  async (ctx, { orm, seed }) => {
    await seed.agentSetup();
    const { sessions } = externalAgentUseCases(orm);
    await sessions.createAgentCode(SETUP_HOLDER, CODE);

    await expect(sessions.readPendingAgentCode(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  },
);

const CODE = { way: "answers_masked_questions", origin: "http://localhost:8080" } as const;
const INVALID_CODE = { code: "UNAUTHENTICATED", message: "The code is not valid." };
