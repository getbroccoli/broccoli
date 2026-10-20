import sharp from "sharp";

import {
  expect,
  importUseCases,
  OWNER,
  PNG,
  SETUP_HOLDER,
  fakeSlackApi,
  SLACK_PHOTO_URL,
  storedFileIds,
  test,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { createEmployeeUseCases } from "../../../employees";

test("approving gives the employee the Slack photo as their avatar", async ({ orm, seed }) => {
  await seed.setupStep("import");
  await seed.slackConnection();
  const imports = importUseCases(orm, { slackApi: fakeSlackApi() });
  await imports.readSlack(SETUP_HOLDER);
  const imported = (await imports.reads.readReview(SETUP_HOLDER)).listEmployees({});
  const fileId = imported.edges[0]!.node.photoFileId;
  expect(fileId).toEqual(expect.any(String));

  await imports.approveImport(SETUP_HOLDER);

  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(
    employees.edges.map(({ node }) => ({ email: node.email, avatarFileId: node.avatarFileId })),
  ).toEqual([{ email: "avery@example.com", avatarFileId: fileId }]);
  expect(await storedFileIds(orm)).toEqual([fileId]);
  const stored = await readFile(orm, fileId!);
  expect(stored?.mimeType).toBe("image/webp");
  expect(await sharp(stored!.content).metadata()).toMatchObject({ format: "webp" });
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({})).toEqual(imported);
});

test("approving deletes unused photos while keeping import rows and staff files", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const staff = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const [staffFileId] = await storedFileIds(orm);
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
  expect(await storedFileIds(orm)).toEqual([keptPhoto, existingAvatar, staffFileId!].sort());
  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([staff, source]);
  const reviewed = (await imports.reads.readReview(SETUP_HOLDER)).listEmployees({
    orderBy: { field: "EMAIL" },
  });
  expect(
    reviewed.edges.map(({ node }) => ({
      email: node.values.email.value,
      photoFileId: node.photoFileId,
      leftOut: node.leftOut,
    })),
  ).toEqual([
    { email: "incomplete@example.com", photoFileId: null, leftOut: false },
    { email: "kept@example.com", photoFileId: keptPhoto, leftOut: false },
    { email: "leftout@example.com", photoFileId: null, leftOut: true },
    { email: "taken@example.com", photoFileId: null, leftOut: false },
  ]);
});
