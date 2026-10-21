import { expect, NON_OWNER, OWNER, SETUP_HOLDER, test } from "#test/support";

import { readSetup } from ".";

test("the setup holder sees itself as the holder", async ({ orm, seed }) => {
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

  const setup = await readSetup(orm, SETUP_HOLDER);

  expect(setup.holder).toBe("you");
});

test.for([new Date("2000-01-04T12:00:00Z"), new Date("2100-01-04T12:00:00Z")])(
  "another browser sees setup held on another device with a stored session expiring at %s",
  async (expiresAt, { orm, seed }) => {
    await seed.setupSession({ expiresAt });

    const setup = await readSetup(orm, null);

    expect(setup.holder).toBe("another_device");
  },
);

test("nobody holds setup on a fresh instance", async ({ orm }) => {
  const setup = await readSetup(orm, null);

  expect(setup.holder).toBe("nobody");
});

test("nobody holds setup once an owner exists even with a session stored", async ({
  orm,
  seed,
}) => {
  await seed.owner();
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

  const setup = await readSetup(orm, null);

  expect(setup.holder).toBe("nobody");
});

test("the owner sees the demo deadline", async ({ orm, seed }) => {
  const expiresAt = new Date("2026-01-08T12:00:00Z");
  await seed.demoOwner({ expiresAt });

  const setup = await readSetup(orm, OWNER);

  expect(setup.demoExpiresAt).toEqual(expiresAt);
});

test.for([
  { name: "a signed-in non-owner", viewer: NON_OWNER },
  { name: "an anonymous viewer", viewer: null },
])("$name does not see the demo deadline", async ({ viewer }, { orm, seed }) => {
  await seed.demoOwner({ expiresAt: new Date("2026-01-08T12:00:00Z") });

  const setup = await readSetup(orm, viewer);

  expect(setup.demoExpiresAt).toBeNull();
});

test("returns the stored setup step", async ({ orm, seed }) => {
  await seed.setupStep("import");

  const setup = await readSetup(orm, null);

  expect(setup.step).toBe("import");
});
