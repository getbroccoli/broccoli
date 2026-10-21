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

test("finishing the import deletes its rows and staff files but keeps employee avatars", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [
    { email: "avery@example.com", photoUrl: SLACK_PHOTO_URL },
  ]);
  const avatarFileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const employees = createEmployeeUseCases({ orm });
  const approved = await employees.listEmployees(OWNER, {});

  await imports.finishImport(SYSTEM);

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect((await imports.reads.readReview(OWNER)).listEmployees({}).edges).toEqual([]);
  expect(await importReader(orm).listChoices("employee")).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([avatarFileId]);
  expect(await readFile(orm, avatarFileId)).toEqual({ content: PNG, mimeType: "image/png" });
  expect(await employees.listEmployees(OWNER, {})).toEqual(approved);
  expect(approved.edges.map(({ node }) => node.avatarFileId)).toEqual([avatarFileId]);
});
