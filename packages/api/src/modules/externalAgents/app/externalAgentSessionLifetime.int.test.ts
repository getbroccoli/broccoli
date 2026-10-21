import { sql } from "drizzle-orm";

import {
  expect,
  externalAgentUseCases,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  aiSettings,
  test,
} from "#test/support";

import type { Orm } from "../../../core/db";

test("refuses a code that expires while the exchange waits for the instance lock", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code, expiresAt } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);

  const result = await expireWhileWaiting(
    orm,
    () => agents.sessions.startExternalAgentSession(SYSTEM, { code, client: "Test agent" }),
    () => {
      now = new Date(expiresAt.getTime() + 1);
    },
  );

  expect(result).toMatchObject([{ status: "rejected", reason: { code: "UNAUTHENTICATED" } }]);
  expect(await agents.sessions.readExternalAgentConnection(SETUP_HOLDER)).toBeNull();
});

test("refuses a call when the agent session expires while waiting for the instance lock", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token, expiresAt } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;

  const result = await expireWhileWaiting(
    orm,
    () => agents.files.listUnansweredFiles(ctx),
    () => {
      now = new Date(expiresAt.getTime() + 1);
    },
  );

  expect(result).toMatchObject([{ status: "rejected", reason: SESSION_ENDED }]);
});

test.for(["chooseExternalAgent", "createExternalAgentCode", "disconnectExternalAgent"] as const)(
  "%s ends a live session",
  async (operation, { orm, seed }) => {
    await seed.externalAgentSetup();
    const agents = externalAgentUseCases(orm);
    const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
    const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
      code,
      client: "Test agent",
    });
    const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;

    if (operation === "createExternalAgentCode")
      await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
    else await agents.sessions[operation](SETUP_HOLDER);

    expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
    expect(await agents.sessions.readExternalAgentConnection(SETUP_HOLDER)).toBeNull();
    await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
    await expect(agents.files.waitForUnansweredFiles(ctx, { seconds: 1 })).rejects.toMatchObject(
      SESSION_ENDED,
    );
  },
);

test("expires a session two hours after exchange despite recent calls", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  now = new Date("2026-10-20T13:00:00Z");
  const { token, expiresAt } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  expect(expiresAt).toEqual(new Date("2026-10-20T15:00:00Z"));
  now = new Date("2026-10-20T14:59:59Z");
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  expect(ctx).not.toBeNull();

  now = expiresAt;

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session once an owner exists even at the import step", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;

  await seed.owner();

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session after setup leaves import", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;

  await seed.setupStep("owner");

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session when the setup session expires", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  let now = new Date("2026-10-20T12:00:00Z");
  await seed.setupSession({ expiresAt: new Date("2026-10-20T13:00:00Z") });
  const agents = externalAgentUseCases(orm, { clock: () => now });
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;

  now = new Date("2026-10-20T13:00:00Z");

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session after OpenRouter is saved", async ({ orm, seed, fakeDecisions }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  fakeDecisions.acceptKey("test-key");

  await aiSettings(orm, { url: fakeDecisions.url }).save(SETUP_HOLDER, {
    source: "openrouter",
    openRouterKey: "test-key",
  });

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("choosing the agent again never revives a session idled by OpenRouter", async ({
  orm,
  seed,
  fakeDecisions,
}) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  fakeDecisions.acceptKey("test-key");
  await aiSettings(orm, { url: fakeDecisions.url }).save(SETUP_HOLDER, {
    source: "openrouter",
    openRouterKey: "test-key",
  });

  await agents.sessions.chooseExternalAgent(SETUP_HOLDER);

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a session after approval", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  const imports = importUseCases(orm);
  const version = (await imports.reads.readReview(SETUP_HOLDER)).version;

  await imports.approveImport(SETUP_HOLDER, version);

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

test("refuses a live token after the demo starts", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  expect(await agents.files.listUnansweredFiles(ctx)).toEqual([]);

  await importUseCases(orm).startDemo(SETUP_HOLDER);

  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.listUnansweredFiles(ctx)).rejects.toMatchObject(SESSION_ENDED);
});

const CODE = { origin: "http://localhost:8080" };
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
