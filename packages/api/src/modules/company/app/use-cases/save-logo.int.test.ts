import { onTestFinished } from "vitest";

import { companyUseCases, expect, JPEG, PNG as logo, test } from "#test/support";

test("saves a PNG and serves its bytes and content type", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  const saved = await company.saveLogo(actor, logo);

  expect(saved.logoId).toEqual(expect.any(String));
  expect((await company.getCompany(actor)).logoId).toBe(saved.logoId);
  expect(await company.readLogo(actor, saved.logoId!)).toEqual({
    bytes: logo,
    mimeType: "image/png",
  });
});

test("gives a replacement logo a new id and stops serving the old id", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.saveLogo(actor, logo);

  const saved = await company.saveLogo(actor, logo);

  expect(saved.logoId).toEqual(expect.any(String));
  expect(saved.logoId).not.toBe(before.logoId);
  expect(await company.readLogo(actor, before.logoId!)).toBeNull();
  expect(await company.readLogo(actor, saved.logoId!)).toEqual({
    bytes: logo,
    mimeType: "image/png",
  });
});

test("refuses an SVG and keeps the previous logo", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.saveLogo(actor, logo);

  await expect(
    company.saveLogo(actor, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "logo", code: "invalid" }],
  });

  expect(await company.getCompany(actor)).toEqual(before);
  expect(await company.readLogo(actor, before.logoId!)).toEqual({
    bytes: logo,
    mimeType: "image/png",
  });
});

test("refuses a truncated PNG and keeps the previous logo", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.saveLogo(actor, logo);

  await expect(company.saveLogo(actor, logo.subarray(0, 8))).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "logo", code: "invalid" }],
  });

  expect(await company.getCompany(actor)).toEqual(before);
  expect(await company.readLogo(actor, before.logoId!)).toEqual({
    bytes: logo,
    mimeType: "image/png",
  });
});

test("refuses a non-owner without changing the logo", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.getCompany(owner);

  await expect(
    company.saveLogo(
      { userId: "another-user", email: "another@example.com", isOwner: false },
      logo,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the owner can do this." });

  expect(await company.getCompany(owner)).toEqual(before);
});

test("keeps the owner's saved logo when a pending brand lookup finishes", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const lookupStarted = Promise.withResolvers<void>();
  const lookup = Promise.withResolvers<{ name: string; logo: Buffer }>();
  const brand = { name: "Example Labs", logo: JPEG };
  const company = companyUseCases(orm, {
    brandLookup: () => {
      lookupStarted.resolve();
      return lookup.promise;
    },
  });
  const pending = company.detectCompanyNameAndLogo({
    userId: actor.userId,
    email: "owner@example.com",
  });
  onTestFinished(async () => {
    lookup.resolve(brand);
    await pending;
  });
  await lookupStarted.promise;

  const saved = await company.saveLogo(actor, logo);
  lookup.resolve(brand);
  await pending;

  expect((await company.getCompany(actor)).logoId).toBe(saved.logoId);
  expect(await company.readLogo(actor, saved.logoId!)).toEqual({
    bytes: logo,
    mimeType: "image/png",
  });
});
