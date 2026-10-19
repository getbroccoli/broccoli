import {
  expect,
  importUseCases,
  OWNER,
  PNG,
  SETUP_HOLDER,
  slackPhotoReader,
  SLACK_PHOTO_URL,
  storedFileIds,
  test,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { instanceRepository } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test("approving gives the employee the Slack photo as their avatar", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm, { slack: slackPhotoReader() });
  await imports.readSlack(SETUP_HOLDER);
  const imported = await imports.reads.listEmployees(SETUP_HOLDER, {});
  const fileId = imported.edges[0]!.node.photoFileId;
  expect(fileId).toEqual(expect.any(String));

  await imports.approveImport(SETUP_HOLDER);

  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(
    employees.edges.map(({ node }) => ({ email: node.email, avatarFileId: node.avatarFileId })),
  ).toEqual([{ email: "avery@example.com", avatarFileId: fileId }]);
  expect(await storedFileIds(orm)).toEqual([fileId]);
  expect(await readFile(orm, fileId!)).toEqual({ content: PNG, mimeType: "image/png" });
});

test("approving deletes unused import photos and staff files while keeping employee avatars", async ({
  orm,
  seed,
}) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const existingAvatar = await seed.file({ content: PNG, mimeType: "image/png" });
  await seed.employee({ email: "taken@example.com", avatarFileId: existingAvatar });
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "kept@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "leftout@example.com", photoUrl: SLACK_PHOTO_URL },
    { email: "incomplete@example.com", lastName: null, photoUrl: SLACK_PHOTO_URL },
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
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(SETUP_HOLDER, { key: "leftout@example.com", leftOut: true });

  await imports.approveImport(SETUP_HOLDER);

  const keptPhoto = photoIds.get("kept@example.com")!;
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {
    orderBy: { field: "EMAIL" },
  });
  expect(
    employees.edges.map(({ node }) => ({ email: node.email, avatarFileId: node.avatarFileId })),
  ).toEqual([
    { email: "kept@example.com", avatarFileId: keptPhoto },
    { email: "taken@example.com", avatarFileId: existingAvatar },
  ]);
  expect(await storedFileIds(orm)).toEqual([keptPhoto, existingAvatar].sort());
  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
});
