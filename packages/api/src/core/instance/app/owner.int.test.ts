import {
  importServices,
  expect,
  EMPLOYEE,
  SYSTEM,
  test,
  instances,
  owners,
  recordHistory,
  scotlandTimeOffSetup,
} from "#test/support";

import { user } from "../../auth";
import { ormOf, transactor, type Tx } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import { NO_SETUP_INVITES } from "../domain";

test("refuses an employee claiming ownership without creating a user or advancing setup", async ({
  orm,
  transact,
}) => {
  await expect(
    transact((tx) =>
      owners.claimOwner(EMPLOYEE, tx, async () => {
        const owner = { id: "owner-1", name: "Owner", email: "owner@example.com" };
        await ormOf(tx).insert(user).values(owner);
        return { user: owner };
      }),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await instances.readInstance(orm)).toMatchObject({ ownerUserId: null, step: "company" });
  expect(await orm.select().from(user)).toEqual([]);
});

test.for(["company", "import"] as const)(
  "claiming ownership keeps the %s step",
  async (step, { orm, seed, transact }) => {
    await seed.setupStep(step);

    const owner = await transact((tx) => owners.claimOwner(SYSTEM, tx, () => insertOwner(tx)));

    expect(await instances.readInstance(orm)).toMatchObject({ ownerUserId: owner.user.id, step });
  },
);

test("creates the owner for the holder, completes setup and ends the session", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const completed: unknown[] = [];
  const claimed: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      completed.push(payload);
      return Promise.resolve();
    },
    "instance.owner_claimed": (payload) => {
      claimed.push(payload);
      return Promise.resolve();
    },
  });

  const { owner } = await transact((tx) =>
    owners.createOwnerAtSetup(
      SYSTEM,
      tx,
      {
        token: "setup-token",
        now: new Date("2026-01-02T12:00:00Z"),
      },
      () => insertOwner(tx),
      importServices(orm).addApprovedPeople,
      CHOICES,
    ),
  );

  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: owner.user.id,
    step: "done",
  });
  expect((await instances.readInstance(orm)).setupSession).toBeNull();
  expect(completed).toEqual([null]);
  expect(claimed).toEqual([{ userId: owner.user.id, email: owner.user.email }]);
});

test("attributes the terms set up during owner creation to the new owner", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

  const { owner } = await transact((tx) =>
    owners.createOwnerAtSetup(
      SYSTEM,
      tx,
      { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") },
      () => insertOwner(tx),
      importServices(orm).addApprovedPeople,
      { ...CHOICES, timeOff: scotlandTimeOffSetup() },
    ),
  );

  const history = await recordHistory.read(orm, "terms", await seed.defaultTermsId(), {});
  expect(history.edges.map(({ node }) => node)).toMatchObject([
    {
      author: { kind: "SIGNED_IN_USER", id: owner.user.id },
      cause: { kind: "TIME_OFF_TURNED_ON" },
    },
  ]);
});

test.for([null, "another-token"])(
  "refuses owner creation with token %s and creates no user",
  async (token, { orm, seed, transact }) => {
    await seed.setupStep("owner");
    await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

    await expect(
      transact((tx) =>
        owners.createOwnerAtSetup(
          SYSTEM,
          tx,
          {
            token,
            now: new Date("2026-01-02T12:00:00Z"),
          },
          () => insertOwner(tx),
          importServices(orm).addApprovedPeople,
          CHOICES,
        ),
      ),
    ).rejects.toMatchObject({ name: "SetupInProgressError" });

    expect(await orm.select().from(user)).toEqual([]);
    expect(await instances.readInstance(orm)).toMatchObject({ ownerUserId: null, step: "owner" });
  },
);

test("refuses owner creation with an expired setup session", async ({ orm, seed, transact }) => {
  const now = new Date("2026-01-04T12:00:00Z");
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: now });

  await expect(
    transact((tx) =>
      owners.createOwnerAtSetup(
        SYSTEM,
        tx,
        {
          token: "setup-token",
          now,
        },
        () => insertOwner(tx),
        importServices(orm).addApprovedPeople,
        CHOICES,
      ),
    ),
  ).rejects.toMatchObject({ name: "SetupInProgressError" });

  expect(await orm.select().from(user)).toEqual([]);
});

test.for(["company", "import"] as const)(
  "refuses owner creation at the %s step",
  async (step, { orm, seed, transact }) => {
    await seed.setupStep(step);
    await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

    await expect(
      transact((tx) =>
        owners.createOwnerAtSetup(
          SYSTEM,
          tx,
          {
            token: "setup-token",
            now: new Date("2026-01-02T12:00:00Z"),
          },
          () => insertOwner(tx),
          importServices(orm).addApprovedPeople,
          CHOICES,
        ),
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Finish the import before creating the owner.",
    });

    expect(await orm.select().from(user)).toEqual([]);
    expect((await instances.readInstance(orm)).step).toBe(step);
  },
);

test("keeps one owner when two creations arrive together", async ({ orm, seed, transact }) => {
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const credential = { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") };

  const results = await Promise.allSettled([
    transact((tx) =>
      owners.createOwnerAtSetup(
        SYSTEM,
        tx,
        credential,
        () => insertOwner(tx, "owner-1"),
        importServices(orm).addApprovedPeople,
        CHOICES,
      ),
    ),
    transact((tx) =>
      owners.createOwnerAtSetup(
        SYSTEM,
        tx,
        credential,
        () => insertOwner(tx, "owner-2"),
        importServices(orm).addApprovedPeople,
        CHOICES,
      ),
    ),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { name: "OwnerExistsError" } },
  ]);
  const users = await orm.select().from(user);
  expect(users).toHaveLength(1);
  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: users[0]!.id,
    step: "done",
  });
});

async function insertOwner(tx: Tx, id = "owner-1") {
  const owner = { id, name: "Owner", email: `${id}@example.com` };
  await ormOf(tx).insert(user).values(owner);
  return { user: owner };
}

const CHOICES = { ...NO_SETUP_INVITES, linkOrigin: "https://broccoli.example.com" };
