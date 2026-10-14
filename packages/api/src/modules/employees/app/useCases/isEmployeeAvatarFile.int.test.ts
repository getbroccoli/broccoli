import { expect, NON_OWNER, OWNER, test, WEBP } from "#test/support";

import { createEmployeeUseCases } from ".";

test("recognises a file referenced by an employee's avatar", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ avatarFileId });
  const { isEmployeeAvatarFile } = createEmployeeUseCases({ orm });

  expect(await isEmployeeAvatarFile(OWNER, avatarFileId)).toBe(true);
});

test("refuses a stored file that no employee references", async ({ orm, seed }) => {
  const fileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  const { isEmployeeAvatarFile } = createEmployeeUseCases({ orm });

  expect(await isEmployeeAvatarFile(OWNER, fileId)).toBe(false);
});

test("refuses an avatar id that is not a uuid", async ({ orm }) => {
  const { isEmployeeAvatarFile } = createEmployeeUseCases({ orm });

  expect(await isEmployeeAvatarFile(OWNER, "not-a-uuid")).toBe(false);
});

test("refuses to check an employee avatar for a non-owner", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ avatarFileId });
  const { isEmployeeAvatarFile } = createEmployeeUseCases({ orm });

  await expect(isEmployeeAvatarFile(NON_OWNER, avatarFileId)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
