import { companyUseCases, expect, PNG as logo, test } from "#test/support";

test("recognises the current logo", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const saved = await company.saveLogo(actor, logo);

  expect(await company.isCurrentLogo(actor, saved.logoFileId!)).toBe(true);
});

test("does not recognise a replaced logo", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.saveLogo(actor, logo);
  await company.saveLogo(actor, logo);

  expect(await company.isCurrentLogo(actor, before.logoFileId!)).toBe(false);
});

test("returns false for an id that is not a uuid", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  await company.saveLogo(actor, logo);

  expect(await company.isCurrentLogo(actor, "not-a-uuid")).toBe(false);
});

test("refuses a non-owner", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const saved = await company.saveLogo(actor, logo);

  await expect(
    company.isCurrentLogo({ userId: "another-user", isOwner: false }, saved.logoFileId!),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
