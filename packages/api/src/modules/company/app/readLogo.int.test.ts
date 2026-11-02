import { companyService, expect, EMPLOYEE, PNG, test, fileStorage } from "#test/support";

test("returns the current logo's bytes and WebP MIME type", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyService(orm);
  const saved = await company.saveLogo(actor, PNG);
  const stored = await fileStorage.readFile(orm, saved.logoFileId!);

  const logo = await company.readLogo(actor, saved.logoFileId!);

  expect(logo).toEqual({ content: stored!.content, mimeType: "image/webp" });
});

test("returns null for a replaced logo's id", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyService(orm);
  const before = await company.saveLogo(actor, PNG);
  await company.saveLogo(actor, PNG);

  const logo = await company.readLogo(actor, before.logoFileId!);

  expect(logo).toBeNull();
});

test("allows an employee to read the company logo", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyService(orm);
  const saved = await company.saveLogo(actor, PNG);

  const logo = await company.readLogo(EMPLOYEE, saved.logoFileId!);

  expect(logo).toEqual(await fileStorage.readFile(orm, saved.logoFileId!));
});
