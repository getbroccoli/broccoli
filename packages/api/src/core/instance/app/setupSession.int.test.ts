import { createHash } from "node:crypto";

import { expect, NON_OWNER, SYSTEM, test } from "#test/support";

import { instanceRepository } from "../db";
import { hashSetupToken } from "../domain";
import { readSetupHolder, startSetup } from ".";

test("starts a setup session on a fresh instance and stores only its hash", async ({
  orm,
  transact,
}) => {
  const now = new Date("2026-01-01T12:00:00Z");

  const session = await transact((tx) => startSetup(SYSTEM, tx, { token: null, now }));

  expect(session.token).toEqual(expect.any(String));
  expect(session.token.length).toBeGreaterThan(0);
  expect(session.expiresAt).toEqual(new Date("2026-01-04T12:00:00Z"));
  expect(await instanceRepository(orm).readSetupSession()).toEqual({
    tokenHash: createHash("sha256").update(session.token).digest("hex"),
    expiresAt: session.expiresAt,
  });
});

test("extends the session when its holder starts again", async ({ orm, seed, transact }) => {
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const now = new Date("2026-01-02T12:00:00Z");

  const session = await transact((tx) => startSetup(SYSTEM, tx, { token: "setup-token", now }));

  expect(session).toEqual({ token: "setup-token", expiresAt: new Date("2026-01-05T12:00:00Z") });
  expect(await instanceRepository(orm).readSetupSession()).toEqual({
    tokenHash: hashSetupToken("setup-token"),
    expiresAt: session.expiresAt,
  });
});

test.for([null, "another-token"])(
  "refuses a start with %s while setup is held",
  async (token, { orm, seed, transact }) => {
    const expiresAt = new Date("2026-01-04T12:00:00Z");
    await seed.setupSession({ expiresAt });

    await expect(
      transact((tx) =>
        startSetup(SYSTEM, tx, {
          token,
          now: new Date("2026-01-02T12:00:00Z"),
        }),
      ),
    ).rejects.toMatchObject({
      name: "SetupInProgressError",
      message: "Setup is in progress on another device",
    });

    expect(await instanceRepository(orm).readSetupSession()).toEqual({
      tokenHash: hashSetupToken("setup-token"),
      expiresAt,
    });
  },
);

test.for([null, "setup-token"])(
  "keeps setup locked at expiry for token %s",
  async (token, { seed, transact }) => {
    const now = new Date("2026-01-04T12:00:00Z");
    await seed.setupSession({ expiresAt: now });

    await expect(transact((tx) => startSetup(SYSTEM, tx, { token, now }))).rejects.toMatchObject({
      name: "SetupInProgressError",
    });
  },
);

test("two simultaneous starts leave one holder", async ({ orm, transact }) => {
  const now = new Date("2026-01-01T12:00:00Z");

  const results = await Promise.allSettled([
    transact((tx) => startSetup(SYSTEM, tx, { token: null, now })),
    transact((tx) => startSetup(SYSTEM, tx, { token: null, now })),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { name: "SetupInProgressError" } },
  ]);
  const winner = results.find((result) => result.status === "fulfilled")!;
  expect(await readSetupHolder(orm, { token: winner.value.token, now })).toBe("you");
});

test("refuses a start once an owner exists", async ({ seed, transact }) => {
  await seed.owner();

  await expect(
    transact((tx) =>
      startSetup(SYSTEM, tx, {
        token: null,
        now: new Date("2026-01-01T12:00:00Z"),
      }),
    ),
  ).rejects.toMatchObject({ name: "OwnerExistsError" });
});

test("refuses a non-owner starting setup", async ({ orm, transact }) => {
  await expect(
    transact((tx) =>
      startSetup(NON_OWNER, tx, {
        token: null,
        now: new Date("2026-01-01T12:00:00Z"),
      }),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await instanceRepository(orm).readSetupSession()).toBeNull();
});

test("reports you for the valid setup holder", async ({ orm, seed }) => {
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

  expect(
    await readSetupHolder(orm, { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") }),
  ).toBe("you");
});

test.for([
  { token: null, now: new Date("2026-01-02T12:00:00Z") },
  { token: "another-token", now: new Date("2026-01-02T12:00:00Z") },
  { token: "setup-token", now: new Date("2026-01-04T12:00:00Z") },
])(
  "reports another device for an invalid session credential: %j",
  async (credential, { orm, seed }) => {
    await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

    expect(await readSetupHolder(orm, credential)).toBe("another_device");
  },
);

test("reports nobody when no setup session exists", async ({ orm }) => {
  expect(await readSetupHolder(orm, { token: null, now: new Date("2026-01-01T12:00:00Z") })).toBe(
    "nobody",
  );
});

test("reports nobody once an owner exists even with a setup session", async ({ orm, seed }) => {
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  await seed.owner();

  expect(
    await readSetupHolder(orm, { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") }),
  ).toBe("nobody");
});
