import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { expect, test } from "#test/support";

import { account, user } from "../../auth";
import { runInTransaction, type Orm } from "../../db";
import { createEventBus } from "../../events";
import { readOwnerUserId, readSetupStep } from "../../instance";
import { createLogger } from "../../logger";
import type { ManagedTicket } from "../domain";
import { managedTicket } from "../db";
import { SignInRefusedError, signInWithTicket } from "./signInWithTicket";

const NOW = new Date("2026-10-12T10:00:00Z");

function ticket(overrides: Partial<ManagedTicket> = {}): ManagedTicket {
  return {
    subject: "subject-1",
    email: "owner@example.com",
    name: "Ada Owner",
    company: "c-acme",
    state: "a".repeat(64),
    jti: randomUUID(),
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...overrides,
  };
}

function signIn(orm: Orm, value: ManagedTicket, now = NOW) {
  const events: string[] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "instance.owner_claimed": () => {
      events.push("owner_claimed");
      return Promise.resolve();
    },
  });
  return {
    events,
    result: runInTransaction(orm, eventBus, (tx) => signInWithTicket(tx, value, now)),
  };
}

test("creates the owner from the first ticket", async ({ orm }) => {
  const { result, events } = signIn(orm, ticket());

  const { userId } = await result;

  expect(await readOwnerUserId(orm)).toBe(userId);
  expect(await readSetupStep(orm)).toBe("company");
  expect(events).toEqual(["owner_claimed"]);
});

test("keeps the returning owner's edited profile", async ({ orm }) => {
  const { userId } = await signIn(orm, ticket()).result;
  await orm
    .update(user)
    .set({ name: "Edited Owner", email: "edited@example.com" })
    .where(eq(user.id, userId));

  const again = await signIn(orm, ticket({ name: "Ada Owner" })).result;

  expect(again.userId).toBe(userId);
  const [row] = await orm
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  expect(row).toEqual({ name: "Edited Owner", email: "edited@example.com" });
});

test("refuses another subject once an owner exists", async ({ orm }) => {
  await signIn(orm, ticket()).result;

  await expect(signIn(orm, ticket({ subject: "subject-2" })).result).rejects.toBeInstanceOf(
    SignInRefusedError,
  );
});

test("refuses a replayed ticket", async ({ orm }) => {
  const first = ticket();
  await signIn(orm, first).result;

  await expect(signIn(orm, first).result).rejects.toBeInstanceOf(SignInRefusedError);
});

test("refuses one of two concurrent posts of the same ticket", async ({ orm }) => {
  const value = ticket();

  const results = await Promise.allSettled([signIn(orm, value).result, signIn(orm, value).result]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: expect.any(SignInRefusedError),
  });
});

test("refuses a ticket that expired while waiting", async ({ orm }) => {
  const value = ticket({ expiresAt: NOW });

  await expect(signIn(orm, value).result).rejects.toBeInstanceOf(SignInRefusedError);
});

test("leaves the ticket unused when the transaction fails", async ({ orm }) => {
  const value = ticket();
  const eventBus = createEventBus(createLogger("silent"));
  await expect(
    runInTransaction(orm, eventBus, async (tx) => {
      await signInWithTicket(tx, value, NOW);
      throw new Error("later step failed");
    }),
  ).rejects.toThrow("later step failed");

  await expect(signIn(orm, value).result).resolves.toEqual({ userId: expect.any(String) });
});

test("deletes expired tickets on sign-in", async ({ orm }) => {
  const old = ticket({ expiresAt: new Date(NOW.getTime() + 1_000) });
  await signIn(orm, old).result;
  const current = ticket();

  await signIn(orm, current, new Date(NOW.getTime() + 2_000)).result;

  expect(await orm.select({ jti: managedTicket.jti }).from(managedTicket)).toEqual([
    { jti: current.jti },
  ]);
});

test("links the owner to the accounts subject without a password", async ({ orm }) => {
  const value = ticket();

  const { userId } = await signIn(orm, value).result;

  expect(await orm.select().from(account).where(eq(account.userId, userId))).toEqual([
    expect.objectContaining({
      providerId: "broccoli-accounts",
      accountId: value.subject,
      password: null,
    }),
  ]);
});
