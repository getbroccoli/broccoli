import { eq } from "drizzle-orm";
import {
  deleteAllEmployees,
  employeeUseCases,
  expect,
  ADMIN,
  EMPLOYEE,
  SYSTEM,
  test,
} from "#test/support";

import { user } from "../../auth";
import { ormOf, type Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { readInstance, readSetupHolder, exitDemo } from ".";

test("resetting a demo deletes its owner and gives the browser setup at the company step", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.demoOwner({ expiresAt });
  const userId = owner.user!.userId;
  const instance = instanceRepository(orm);
  await instance.storeAiSource("broccoli_ai");
  let cleared = false;

  const setup = await transact((tx) =>
    exitDemo(
      owner,
      tx,
      { userId, now },
      {
        clearPeople: () => {
          cleared = true;
          return Promise.resolve();
        },
        deleteOwner: async () => {
          await ormOf(tx).delete(user).where(eq(user.id, userId));
        },
      },
    ),
  );

  expect(cleared).toBe(true);
  expect(await orm.select().from(user)).toEqual([]);
  expect(await readInstance(orm)).toMatchObject({
    ownerUserId: null,
    demoExpiresAt: null,
    step: "company",
  });
  expect(setup.token).toEqual(expect.any(String));
  expect(setup.expiresAt).toEqual(new Date("2026-01-05T12:00:00Z"));
  expect(await readSetupHolder(orm, { token: setup.token, now })).toBe("you");
  expect(await instance.readAiSource()).toEqual({
    source: "broccoli_ai",
    encryptedOpenRouterKey: null,
  });
});

test.for([
  { reason: "the owner has a real account", deadline: null, userId: undefined },
  {
    reason: "another user asks",
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
  "refuses to reset the demo without changing anything when $reason",
  async ({ deadline, userId }, { orm, seed, transact }) => {
    const owner = await seed.demoOwner({ expiresAt });
    const instance = instanceRepository(orm);
    await instance.saveDemoExpiresAt(deadline);
    const users = await orm.select().from(user);
    let cleared = false;
    let deleted = false;

    await expect(
      transact((tx) =>
        exitDemo(
          SYSTEM,
          tx,
          { userId: userId ?? owner.user!.userId, now },
          {
            clearPeople: () => {
              cleared = true;
              return Promise.resolve();
            },
            deleteOwner: () => {
              deleted = true;
              return Promise.resolve();
            },
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(cleared).toBe(false);
    expect(deleted).toBe(false);
    expect(await orm.select().from(user)).toEqual(users);
    expect(await readInstance(orm)).toMatchObject({
      ownerUserId: owner.user!.userId,
      step: "done",
      demoExpiresAt: deadline,
      setupSession: null,
    });
  },
);

test.for([EMPLOYEE, ADMIN])(
  "refuses a caller without reset access even with the demo owner's user id",
  async (ctx, { seed, transact }) => {
    const owner = await seed.demoOwner({ expiresAt });

    await expect(
      transact((tx) =>
        exitDemo(
          ctx,
          tx,
          { userId: owner.user!.userId, now },
          {
            clearPeople: () => Promise.resolve(),
            deleteOwner: () => Promise.resolve(),
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the owner can do this." });
  },
);

test("rolls back a demo reset when clearing people fails", async ({ orm, seed, transact }) => {
  const owner = await seed.demoOwner({ expiresAt });
  const userId = owner.user!.userId;
  const users = await orm.select().from(user);
  let deleted = false;

  await expect(
    transact((tx) =>
      exitDemo(
        owner,
        tx,
        { userId, now },
        {
          clearPeople: async (_ctx: SecurityContext, tx: Tx) => {
            await ormOf(tx)
              .update(user)
              .set({ name: "Changed before failure" })
              .where(eq(user.id, userId));
            throw new Error("Clearing people failed");
          },
          deleteOwner: () => {
            deleted = true;
            return Promise.resolve();
          },
        },
      ),
    ),
  ).rejects.toThrow("Clearing people failed");

  expect(deleted).toBe(false);
  expect(await orm.select().from(user)).toEqual(users);
  expect(await readInstance(orm)).toMatchObject({
    ownerUserId: userId,
    demoExpiresAt: expiresAt,
    step: "done",
    setupSession: null,
  });
});

test("exiting the demo deletes every linked user before removing its provisional owner", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.demoOwner({ expiresAt });
  await seed.employee({ userId: owner.user!.userId });
  for (const email of ["avery@example.com", "robin@example.com"]) {
    const joined = await seed.user({ email });
    await seed.employee({ email, userId: joined.id });
  }

  await transact((tx) =>
    exitDemo(
      owner,
      tx,
      { userId: owner.user!.userId, now },
      {
        clearPeople: deleteAllEmployees,
        deleteOwner: async () => {
          expect(await ormOf(tx).select({ id: user.id }).from(user)).toEqual([
            { id: owner.user!.userId },
          ]);
          await ormOf(tx).delete(user).where(eq(user.id, owner.user!.userId));
        },
      },
    ),
  );

  expect(await orm.select().from(user)).toEqual([]);
  expect((await employeeUseCases(orm).listEmployees(SYSTEM, {})).edges).toEqual([]);
});

const now = new Date("2026-01-02T12:00:00Z");
const expiresAt = new Date("2026-01-04T12:00:00Z");
