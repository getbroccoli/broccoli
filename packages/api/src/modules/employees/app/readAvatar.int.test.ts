import { employeeUseCases, expect, SETUP_HOLDER, OWNER, test, WEBP } from "#test/support";

test("returns an employee's avatar bytes and MIME type", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ avatarFileId });
  const { readAvatar } = employeeUseCases(orm);

  const avatar = await readAvatar(OWNER, avatarFileId);

  expect(avatar).toEqual({ content: WEBP, mimeType: "image/webp" });
});

test("returns null for a stored file that no employee references", async ({ orm, seed }) => {
  const fileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  const { readAvatar } = employeeUseCases(orm);

  const avatar = await readAvatar(OWNER, fileId);

  expect(avatar).toBeNull();
});

test("returns null for an avatar id that is not a uuid", async ({ orm }) => {
  const { readAvatar } = employeeUseCases(orm);

  const avatar = await readAvatar(OWNER, "not-a-uuid");

  expect(avatar).toBeNull();
});

test("refuses the setup holder reading an employee avatar", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ avatarFileId });
  const { readAvatar } = employeeUseCases(orm);

  await expect(readAvatar(SETUP_HOLDER, avatarFileId)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
