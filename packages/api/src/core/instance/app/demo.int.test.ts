import { eq } from "drizzle-orm";
import { expect, NON_OWNER, SYSTEM, test, type TestSeed } from "#test/support";

import { user } from "../../auth";
import { ormOf, transactor, type Tx } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { completeImportStep, finishDemo, readInstance, startDemoAtSetup } from ".";

test("starts a seven-day demo for the setup holder, claims the owner and completes setup", async ({
  orm,
  seed,
}) => {
  await prepareDemoSetup(seed);
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const claimed: unknown[] = [];
  const completed: unknown[] = [];
  eventBus.subscribe({
    "instance.owner_claimed": (payload) => {
      claimed.push(payload);
      return Promise.resolve();
    },
    "instance.setup_completed": (payload) => {
      completed.push(payload);
      return Promise.resolve();
    },
  });

  const owner = await transact((tx) =>
    startDemoAtSetup(SYSTEM, tx, credential, () => insertOwner(tx), finishImport),
  );

  expect(owner).toEqual({ user: { id: "owner-1", email: "owner-1@example.com", name: "Owner" } });
  expect(await readInstance(orm)).toMatchObject({
    ownerUserId: owner.user.id,
    step: "done",
    demoExpiresAt: new Date("2026-01-09T12:00:00Z"),
    setupSession: null,
  });
  expect(claimed).toEqual([{ userId: owner.user.id, email: owner.user.email }]);
  expect(completed).toEqual([null]);
});

test("refuses a non-owner starting a demo", async ({ orm, seed, transact }) => {
  await prepareDemoSetup(seed);

  await expect(
    transact((tx) =>
      startDemoAtSetup(NON_OWNER, tx, credential, () => insertOwner(tx), finishImport),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await orm.select().from(user)).toEqual([]);
});

test("refuses to start a demo when an owner already exists", async ({ orm, seed, transact }) => {
  const owner = await seed.owner();
  await prepareDemoSetup(seed);

  await expect(
    transact((tx) => startDemoAtSetup(SYSTEM, tx, credential, () => insertOwner(tx), finishImport)),
  ).rejects.toMatchObject({ name: "OwnerExistsError" });

  expect(await readInstance(orm)).toMatchObject({
    ownerUserId: owner.user!.userId,
    demoExpiresAt: null,
  });
});

test.for([null, "another-token"])(
  "refuses to start a demo with setup token %s",
  async (token, { orm, seed, transact }) => {
    await prepareDemoSetup(seed);

    await expect(
      transact((tx) =>
        startDemoAtSetup(SYSTEM, tx, { token, now }, () => insertOwner(tx), finishImport),
      ),
    ).rejects.toMatchObject({ name: "SetupInProgressError" });

    expect(await orm.select().from(user)).toEqual([]);
    expect((await readInstance(orm)).step).toBe("import");
  },
);

test("refuses to start a demo at the setup session's deadline", async ({ orm, seed, transact }) => {
  await prepareDemoSetup(seed);
  await seed.setupSession({ expiresAt: now });

  await expect(
    transact((tx) => startDemoAtSetup(SYSTEM, tx, credential, () => insertOwner(tx), finishImport)),
  ).rejects.toMatchObject({ name: "SetupInProgressError" });

  expect(await orm.select().from(user)).toEqual([]);
});

test.for(["company", "owner", "done"] as const)(
  "refuses to start a demo at the %s step",
  async (step, { orm, seed, transact }) => {
    await seed.setupSession({ expiresAt });
    await seed.setupStep(step);

    await expect(
      transact((tx) =>
        startDemoAtSetup(SYSTEM, tx, credential, () => insertOwner(tx), finishImport),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await orm.select().from(user)).toEqual([]);
    expect((await readInstance(orm)).step).toBe(step);
  },
);

test("rolls back the owner and setup completion when starting the demo fails", async ({
  orm,
  seed,
  transact,
}) => {
  await prepareDemoSetup(seed);
  const setupSession = (await readInstance(orm)).setupSession;

  await expect(
    transact((tx) =>
      startDemoAtSetup(
        SYSTEM,
        tx,
        credential,
        () => insertOwner(tx),
        async (ctx, tx) => {
          await completeImportStep(ctx, tx);
          throw new Error("Demo fill failed");
        },
      ),
    ),
  ).rejects.toThrow("Demo fill failed");

  expect(await orm.select().from(user)).toEqual([]);
  expect(await readInstance(orm)).toMatchObject({
    ownerUserId: null,
    step: "import",
    demoExpiresAt: null,
    setupSession,
  });
});

test("creates only one owner when two demo starts arrive together", async ({
  orm,
  seed,
  transact,
}) => {
  await prepareDemoSetup(seed);

  const results = await Promise.allSettled([
    transact((tx) =>
      startDemoAtSetup(SYSTEM, tx, credential, () => insertOwner(tx, "owner-1"), finishImport),
    ),
    transact((tx) =>
      startDemoAtSetup(SYSTEM, tx, credential, () => insertOwner(tx, "owner-2"), finishImport),
    ),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { name: "OwnerExistsError" } },
  ]);
  const owners = await orm.select().from(user);
  expect(owners).toHaveLength(1);
  expect((await readInstance(orm)).ownerUserId).toBe(owners[0]!.id);
});

test("upgrades the same owner and clears the demo deadline without claiming ownership again", async ({
  orm,
  seed,
}) => {
  const owner = await seed.demoOwner({ expiresAt });
  const userId = owner.user!.userId;
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const claimed: unknown[] = [];
  eventBus.subscribe({
    "instance.owner_claimed": (payload) => {
      claimed.push(payload);
      return Promise.resolve();
    },
  });

  const upgraded = await transact((tx) =>
    finishDemo(owner, tx, { userId, now }, async () => {
      const [updated] = await ormOf(tx)
        .update(user)
        .set({ email: "upgraded@example.com" })
        .where(eq(user.id, userId))
        .returning();
      return updated!;
    }),
  );

  expect(upgraded).toMatchObject({ id: userId, email: "upgraded@example.com" });
  expect(await readInstance(orm)).toMatchObject({ ownerUserId: userId, demoExpiresAt: null });
  expect(claimed).toEqual([]);
});

test.for([
  { reason: "no demo is running", deadline: null, userId: undefined },
  {
    reason: "the caller is not the instance owner",
    deadline: new Date("2026-01-04T12:00:00Z"),
    userId: "another-user",
  },
  {
    reason: "the deadline has arrived",
    deadline: new Date("2026-01-02T12:00:00Z"),
    userId: undefined,
  },
  {
    reason: "the deadline has passed",
    deadline: new Date("2026-01-01T12:00:00Z"),
    userId: undefined,
  },
])(
  "refuses the upgrade without running it when $reason",
  async ({ deadline, userId }, { orm, seed, transact }) => {
    const owner = await seed.demoOwner({ expiresAt });
    await instanceRepository(orm).saveDemoExpiresAt(deadline);
    let upgraded = false;

    await expect(
      transact((tx) =>
        finishDemo(owner, tx, { userId: userId ?? owner.user!.userId, now }, () => {
          upgraded = true;
          return Promise.resolve(owner);
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(upgraded).toBe(false);
    expect((await readInstance(orm)).demoExpiresAt).toEqual(deadline);
  },
);

test("refuses a non-owner finishing a demo even with the owner's user id", async ({
  seed,
  transact,
}) => {
  const owner = await seed.demoOwner({ expiresAt });
  let upgraded = false;

  await expect(
    transact((tx) =>
      finishDemo(NON_OWNER, tx, { userId: owner.user!.userId, now }, () => {
        upgraded = true;
        return Promise.resolve(owner);
      }),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(upgraded).toBe(false);
});

test("keeps the demo deadline when upgrading the owner fails", async ({ orm, seed, transact }) => {
  const owner = await seed.demoOwner({ expiresAt });

  await expect(
    transact((tx) =>
      finishDemo(owner, tx, { userId: owner.user!.userId, now }, () =>
        Promise.reject(new Error("Upgrade failed")),
      ),
    ),
  ).rejects.toThrow("Upgrade failed");

  expect((await readInstance(orm)).demoExpiresAt).toEqual(expiresAt);
});

const now = new Date("2026-01-02T12:00:00Z");
const expiresAt = new Date("2026-01-04T12:00:00Z");
const credential = { token: "setup-token", now };

async function prepareDemoSetup(seed: TestSeed) {
  await seed.setupStep("import");
  await seed.setupSession({ expiresAt });
}

async function insertOwner(tx: Tx, id = "owner-1") {
  const owner = { id, email: `${id}@example.com`, name: "Owner" };
  await ormOf(tx).insert(user).values(owner);
  return { user: owner };
}

async function finishImport(ctx: SecurityContext, tx: Tx) {
  await completeImportStep(ctx, tx);
}
