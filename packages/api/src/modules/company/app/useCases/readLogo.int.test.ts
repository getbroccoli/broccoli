import { companyUseCases, expect, NON_OWNER, PNG, test } from "#test/support";

import { readFile } from "../../../../core/files";

test("returns the current logo's bytes and WebP MIME type", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const saved = await company.saveLogo(actor, PNG);
  const stored = await readFile(orm, saved.logoFileId!);

  const logo = await company.readLogo(actor, saved.logoFileId!);

  expect(logo).toEqual({ content: stored!.content, mimeType: "image/webp" });
});

test("returns null for a replaced logo's id", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.saveLogo(actor, PNG);
  await company.saveLogo(actor, PNG);

  const logo = await company.readLogo(actor, before.logoFileId!);

  expect(logo).toBeNull();
});

test("refuses to read the logo for a non-owner", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const saved = await company.saveLogo(actor, PNG);

  await expect(company.readLogo(NON_OWNER, saved.logoFileId!)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
  });
});
