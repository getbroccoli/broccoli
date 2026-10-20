import { sql } from "drizzle-orm";

import {
  expect,
  externalAgentUseCases,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  systemUseCases,
  test,
} from "#test/support";

import { instanceRepository } from "../../../core/instance";
import type { Orm } from "../../../core/db";

test("refuses a code that expires while the exchange waits for the instance lock", async ({
  orm,
  seed,
}) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code, expiresAt } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);

  const result = await expireWhileWaiting(
    orm,
    () => agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" }),
    () => {
      now = new Date(expiresAt.getTime() + 1);
    },
  );

  expect(result).toMatchObject([{ status: "rejected", reason: { code: "UNAUTHENTICATED" } }]);
  expect(await agents.sessions.readAgentConnection(SETUP_HOLDER)).toBeNull();
});

test("refuses people when the agent session expires while waiting for the instance lock", async ({
  orm,
  seed,
}) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, {
    ...CODE,
    way: "parses_original_files",
  });
  const { token, expiresAt } = await agents.sessions.startAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;

  const result = await expireWhileWaiting(
    orm,
    () =>
      agents.parsedWay.importPeople(ctx, {
        name: "staff.pdf",
        people: [{ fullName: "Avery Stone", email: "avery@example.com" }],
      }),
    () => {
      now = new Date(expiresAt.getTime() + 1);
    },
  );

  expect(result).toMatchObject([{ status: "rejected", reason: SESSION_ENDED }]);
  const imports = importUseCases(orm);
  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
});

test.for(["chooseAgent", "createAgentCode", "disconnectAgent"] as const)(
  "%s ends a live session",
  async (operation, { orm, seed }) => {
    await seed.agentSetup();
    const agents = externalAgentUseCases(orm);
    const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
    const { token } = await agents.sessions.startAgentSession(SYSTEM, {
      code,
      client: "Test agent",
    });
    const ctx = (await agents.sessions.readAgentSession({ token }))!;

    if (operation === "createAgentCode") await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
    else await agents.sessions[operation](SETUP_HOLDER);

    expect(await agents.sessions.readAgentSession({ token })).toBeNull();
    expect(await agents.sessions.readAgentConnection(SETUP_HOLDER)).toBeNull();
    await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
  },
);

test("expires a session two hours after exchange despite recent calls", async ({ orm, seed }) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  now = new Date("2026-10-20T13:00:00Z");
  const { token, expiresAt } = await agents.sessions.startAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  expect(expiresAt).toEqual(new Date("2026-10-20T15:00:00Z"));
  now = new Date("2026-10-20T14:59:59Z");
  const ctx = (await agents.sessions.readAgentSession({ token }))!;
  expect(ctx).not.toBeNull();

  now = expiresAt;

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session once an owner exists even at the import step", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;

  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "import");

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session after setup leaves import", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;

  await instanceRepository(orm).advanceStep("import", "owner");

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session when the setup session expires", async ({ orm, seed }) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  await seed.setupSession({ expiresAt: new Date("2026-10-20T13:00:00Z") });
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;

  now = new Date("2026-10-20T13:00:00Z");

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session after OpenRouter is saved", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;
  const system = systemUseCases(orm, { checkOpenRouterKey: () => Promise.resolve() });

  await system.saveAiSource(SETUP_HOLDER, { source: "openrouter", openRouterKey: "test-key" });

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("choosing the agent again never revives a session idled by OpenRouter", async ({
  orm,
  seed,
}) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;
  const system = systemUseCases(orm, { checkOpenRouterKey: () => Promise.resolve() });
  await system.saveAiSource(SETUP_HOLDER, { source: "openrouter", openRouterKey: "test-key" });

  await agents.sessions.chooseAgent(SETUP_HOLDER);

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session after approval", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;
  const imports = importUseCases(orm);
  const version = await imports.reads.readVersion(SETUP_HOLDER);

  await imports.approveImport(SETUP_HOLDER, version);

  expect(await agents.sessions.readAgentSession({ token })).toBeNull();
  await expect(agents.maskedWay.listWaiting(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("does not update the last call of an ended session", async ({ orm, seed }) => {
  await seed.agentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  await sessions.readAgentSession({ token });
  await sessions.disconnectAgent(SETUP_HOLDER);
  const before = await orm.execute(sql`select last_call_at from agent_sessions`);
  now = new Date("2026-10-20T12:02:00Z");

  expect(await sessions.readAgentSession({ token })).toBeNull();

  expect((await orm.execute(sql`select last_call_at from agent_sessions`)).rows).toEqual(
    before.rows,
  );
});

const CODE = { way: "answers_masked_questions", origin: "http://localhost:8080" } as const;
const SESSION_ENDED = { code: "UNAUTHENTICATED", message: "Your agent's session ended." };

/** Advances the clock only once Postgres confirms the operation is waiting on the held row. */
async function expireWhileWaiting(
  orm: Orm,
  operation: () => Promise<unknown>,
  expire: () => void,
): Promise<PromiseSettledResult<unknown>[]> {
  const locked = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const holding = orm.transaction(async (tx) => {
    const { rows } = await tx.execute<{ pid: number }>(
      sql`select pg_backend_pid() as pid from instance for update`,
    );
    locked.resolve(rows[0]!.pid);
    await release.promise;
  });
  const blockingPid = await locked.promise;
  const result = Promise.allSettled([operation()]);
  try {
    await expect
      .poll(async () => {
        const { rows } = await orm.execute<{ waiting: boolean }>(sql`
          select exists (
            select from pg_stat_activity
            where datname = current_database()
              and ${blockingPid} = any(pg_blocking_pids(pid))
          ) as waiting
        `);
        return rows[0]!.waiting;
      })
      .toBe(true);
    expire();
  } finally {
    release.resolve();
    await holding;
    await result;
  }
  return result;
}
