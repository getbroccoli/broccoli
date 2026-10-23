import {
  expect,
  importUseCases,
  OWNER,
  PNG,
  SETUP_HOLDER,
  SLACK_PHOTO_URL,
  storedFileIds,
  SYSTEM,
  test,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { createEmployeeUseCases } from "../../../employees";
import { importReader } from "../../db";

test("finishing the import deletes its rows, staff files and unused photos but keeps employee avatars", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "leftout@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "taken@example.com", photoUrl: SLACK_PHOTO_URL },
  ]);
  const photoIds = new Map<string, string>();
  for (const record of records) {
    photoIds.set(
      record.email!,
      await seed.importPhoto(record.id, {
        photoUrl: SLACK_PHOTO_URL,
        content: PNG,
        mimeType: "image/png",
      }),
    );
  }
  const avatarFileId = photoIds.get("avery@example.com")!;
  const existingAvatarFileId = photoIds.get("taken@example.com")!;
  await seed.employee({
    email: "taken@example.com",
    avatarFileId: existingAvatarFileId,
  });
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(SETUP_HOLDER, { key: "leftout@example.com", leftOut: true });
  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const employees = createEmployeeUseCases({ orm });
  const approved = await employees.listEmployees(OWNER, {});
  expect(await readFile(orm, photoIds.get("leftout@example.com")!)).toEqual({
    content: PNG,
    mimeType: "image/png",
  });

  await imports.finishImport(SYSTEM);

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect((await imports.reads.readReview(OWNER)).listEmployees({}).edges).toEqual([]);
  expect(await importReader(orm).listChoices("employee")).toEqual([]);
  const keptFileIds = [avatarFileId, existingAvatarFileId].sort();
  expect(await storedFileIds(orm)).toEqual(keptFileIds);
  expect(await readFile(orm, avatarFileId)).toEqual({ content: PNG, mimeType: "image/png" });
  expect(await readFile(orm, existingAvatarFileId)).toEqual({
    content: PNG,
    mimeType: "image/png",
  });
  expect(await employees.listEmployees(OWNER, {})).toEqual(approved);
  expect(approved.edges.map(({ node }) => node.avatarFileId).sort()).toEqual(keptFileIds);

  await imports.finishImport(SYSTEM);

  expect(await storedFileIds(orm)).toEqual(keptFileIds);
  expect(await employees.listEmployees(OWNER, {})).toEqual(approved);
});
