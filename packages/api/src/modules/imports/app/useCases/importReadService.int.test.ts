import { expect, importUseCases, OWNER, PNG, SLACK_PHOTO_URL, test } from "#test/support";

test("returns an import record's photo bytes and MIME type", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  const fileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importUseCases(orm);

  const photo = await imports.reads.readImportPhoto(OWNER, fileId);

  expect(photo).toEqual({ content: PNG, mimeType: "image/png" });
});

test("returns null for an employee avatar that is not an import photo", async ({ orm, seed }) => {
  const fileId = await seed.file({ content: PNG, mimeType: "image/png" });
  await seed.employee({ avatarFileId: fileId });
  const imports = importUseCases(orm);

  const photo = await imports.reads.readImportPhoto(OWNER, fileId);

  expect(photo).toBeNull();
});

test("returns null for a malformed import photo id", async ({ orm }) => {
  const imports = importUseCases(orm);

  const photo = await imports.reads.readImportPhoto(OWNER, "not-a-file-id");

  expect(photo).toBeNull();
});
