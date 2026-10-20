import { expect, NON_OWNER, OWNER, test, WEBP } from "#test/support";

import { createEmployeeUseCases } from ".";

test("returns an employee's avatar bytes and MIME type", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ avatarFileId });
  const { readAvatar } = createEmployeeUseCases({ orm });

  const avatar = await readAvatar(OWNER, avatarFileId);

  expect(avatar).toEqual({ content: WEBP, mimeType: "image/webp" });
});

test("returns null for a stored file that no employee references", async ({ orm, seed }) => {
  const fileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  const { readAvatar } = createEmployeeUseCases({ orm });

  const avatar = await readAvatar(OWNER, fileId);

  expect(avatar).toBeNull();
});

test("returns null for an avatar id that is not a uuid", async ({ orm }) => {
  const { readAvatar } = createEmployeeUseCases({ orm });

  const avatar = await readAvatar(OWNER, "not-a-uuid");

  expect(avatar).toBeNull();
});

test("refuses to read an employee avatar for a non-owner", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ avatarFileId });
  const { readAvatar } = createEmployeeUseCases({ orm });

  await expect(readAvatar(NON_OWNER, avatarFileId)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
