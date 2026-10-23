import {
  importSourceValues,
  expect,
  importUseCases,
  OWNER,
  PNG,
  SETUP_HOLDER,
  SLACK_PHOTO_URL,
  storedFileIds,
  test,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { readInstance } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test("resetting setup deletes approved employees but keeps the import and its photo files", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "robin@example.com", photoUrl: SLACK_PHOTO_URL },
  ]);
  const photoIds = await Promise.all(
    records.map((record) =>
      seed.importPhoto(record.id, {
        photoUrl: SLACK_PHOTO_URL,
        content: PNG,
        mimeType: "image/png",
      }),
    ),
  );
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const employees = createEmployeeUseCases({ orm });
  expect((await employees.listEmployees(OWNER, {})).edges).toHaveLength(2);
  expect((await readInstance(orm)).step).toBe("owner");
  const imported = (await imports.reads.readReview(SETUP_HOLDER)).listEmployees({});
  const sources = await imports.reads.listSources(SETUP_HOLDER);
  const fileIds = await storedFileIds(orm);

  await imports.resetSetup(SETUP_HOLDER);

  expect((await readInstance(orm)).step).toBe("company");
  expect((await employees.listEmployees(OWNER, {})).edges).toEqual([]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({})).toEqual(imported);
  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toEqual(
    sources.map(importSourceValues),
  );
  expect(await storedFileIds(orm)).toEqual(fileIds);
  for (const photoId of photoIds) {
    expect(await readFile(orm, photoId)).toEqual({ content: PNG, mimeType: "image/png" });
  }
});

test("approving again after reset recreates the employees with their import photos", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
  ]);
  const photoId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importUseCases(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);

  await imports.resetSetup(SETUP_HOLDER);
  expect((await readInstance(orm)).step).toBe("company");
  await seed.setupStep("import");
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);

  expect((await readInstance(orm)).step).toBe("owner");
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(
    employees.edges.map(({ node }) => ({ email: node.email, avatarFileId: node.avatarFileId })),
  ).toEqual([{ email: "avery@example.com", avatarFileId: photoId }]);
  expect(await storedFileIds(orm)).toEqual([photoId]);
  expect(await readFile(orm, photoId)).toEqual({ content: PNG, mimeType: "image/png" });
});

test("resetting the ready step returns to company and deletes approved employees", async ({
  orm,
  seed,
}) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  const employees = createEmployeeUseCases({ orm });
  expect((await readInstance(orm)).step).toBe("ready");
  expect((await employees.listEmployees(owner, {})).edges).toHaveLength(1);

  await imports.resetSetup(owner);

  expect((await readInstance(orm)).step).toBe("company");
  expect((await employees.listEmployees(owner, {})).edges).toEqual([]);
});

test("resetting completed setup keeps the step and employees unchanged", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
  await seed.setupStep("done");
  expect((await readInstance(orm)).step).toBe("done");
  const employees = createEmployeeUseCases({ orm });
  const approved = await employees.listEmployees(owner, {});
  expect(approved.edges).toHaveLength(1);

  await imports.resetSetup(owner);

  expect((await readInstance(orm)).step).toBe("done");
  expect(await employees.listEmployees(owner, {})).toEqual(approved);
});
