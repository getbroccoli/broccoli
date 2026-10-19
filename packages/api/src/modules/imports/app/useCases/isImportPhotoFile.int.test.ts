import {
  expect,
  importUseCases,
  NON_OWNER,
  OWNER,
  PNG,
  SLACK_PHOTO_URL,
  test,
} from "#test/support";

test("recognises an import record's photo file", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  const fileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importUseCases(orm);

  expect(await imports.reads.isImportPhotoFile(OWNER, fileId)).toBe(true);
});

test("does not recognise an employee avatar as an import photo", async ({ orm, seed }) => {
  const fileId = await seed.file({ content: PNG, mimeType: "image/png" });
  await seed.employee({ avatarFileId: fileId });
  const imports = importUseCases(orm);

  expect(await imports.reads.isImportPhotoFile(OWNER, fileId)).toBe(false);
});

test("does not recognise a malformed file id as an import photo", async ({ orm }) => {
  const imports = importUseCases(orm);

  expect(await imports.reads.isImportPhotoFile(OWNER, "not-a-file-id")).toBe(false);
});

test("refuses a non-owner checking an import photo file", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  const fileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const imports = importUseCases(orm);

  await expect(imports.reads.isImportPhotoFile(NON_OWNER, fileId)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
