import { sql } from "drizzle-orm";

import {
  createEmployeeUseCases,
  expect,
  finishSelfHostedSetup,
  importUseCases,
  OWNER,
  PNG,
  SETUP_HOLDER,
  SLACK_PHOTO_URL,
  storedFileIds,
  SYSTEM,
  test,
} from "#test/support";

import { user } from "../../auth";
import { ormOf, transactor, type Tx } from "../../db";
import { createEventBus } from "../../events";
import { createOwnerAtSetup, readInstance } from ".";
import { createLogger } from "../../logger";

test("approval by the setup holder creates nobody until account creation", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  const avery = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };
  await seed.importEmployees(source.id, [avery]);
  const imports = importUseCases(orm);

  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);

  expect((await readInstance(orm)).step).toBe("owner");
  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toEqual([]);
  await finishSelfHostedSetup(orm);
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(employees.edges.map(({ node }) => node)).toMatchObject([avery]);
});

test("a database failure after account creation leaves no owner or employees and preserves the import", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "leftout@example.com", photoUrl: SLACK_PHOTO_URL },
  ]);
  const photos = await Promise.all(
    records.map((record) =>
      seed.importPhoto(record.id, {
        photoUrl: SLACK_PHOTO_URL,
        content: PNG,
        mimeType: "image/png",
      }),
    ),
  );
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(SETUP_HOLDER, { key: "leftout@example.com", leftOut: true });
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const before = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });
  const files = await storedFileIds(orm);
  const instance = await readInstance(orm);
  const eventBus = createEventBus(createLogger("silent"));
  const completed: unknown[] = [];
  eventBus.subscribe({
    "instance.setup_completed": (payload) => {
      completed.push(payload);
      return Promise.resolve();
    },
  });
  const transact = transactor(orm, eventBus);

  await expect(
    transact(async (tx) => {
      await createOwnerAtSetup(
        SYSTEM,
        tx,
        { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") },
        () => insertOwner(tx),
        imports.addApprovedPeople,
      );
      await ormOf(tx).execute(sql`select 1 / 0`);
    }),
  ).rejects.toMatchObject({ cause: { code: "22012" } });

  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toEqual([]);
  expect(await orm.select().from(user)).toEqual([]);
  expect(await readInstance(orm)).toEqual(instance);
  expect(await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id })).toEqual(
    before,
  );
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([{ id: source.id }]);
  expect(await storedFileIds(orm)).toEqual(files);
  expect(completed).toEqual([]);

  await imports.reopenReview(SETUP_HOLDER);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  await finishSelfHostedSetup(orm);
  expect((await readInstance(orm)).step).toBe("done");
  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toMatchObject([
    { node: { email: "avery@example.com", avatarFileId: photos[0] } },
  ]);
});

test("an existing owner refuses account creation before adding the approved people", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}]);
  const imports = importUseCases(orm);
  const users = await orm.select().from(user);
  const before = (await imports.reads.readReview(owner)).listEmployees({});

  await expect(
    transact((tx) =>
      createOwnerAtSetup(
        SYSTEM,
        tx,
        { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") },
        () => insertOwner(tx),
        imports.addApprovedPeople,
      ),
    ),
  ).rejects.toMatchObject({ name: "OwnerExistsError" });

  expect(await orm.select().from(user)).toEqual(users);
  expect((await readInstance(orm)).step).toBe("owner");
  expect((await createEmployeeUseCases({ orm }).listEmployees(owner, {})).edges).toEqual([]);
  expect((await imports.reads.readReview(owner)).listEmployees({})).toEqual(before);
});

async function insertOwner(tx: Tx) {
  const owner = { id: "setup-owner", name: "Owner", email: "owner@example.com" };
  await ormOf(tx).insert(user).values(owner);
  return { user: owner };
}
