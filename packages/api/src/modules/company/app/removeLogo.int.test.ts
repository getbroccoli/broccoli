import { companyService, expect, PNG as logo, storedFileIds, SYSTEM, test } from "#test/support";

test("removes the logo and stops serving its old id", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyService(orm, {
    brandLookup: () => Promise.resolve({ name: "Example Labs", logo }),
  });
  await company.detectCompanyNameAndLogo(SYSTEM, {
    userId: actor.user!.userId,
    email: "owner@example.com",
  });
  const before = await company.getCompany(actor);
  expect(before.logoFileId).toEqual(expect.any(String));

  const removed = await company.removeLogo(actor);

  expect(removed).toEqual({ name: null, suggestedName: "Example Labs", logoFileId: null });
  expect((await company.getCompany(actor)).logoFileId).toBeNull();
  expect(await company.readLogo(actor, before.logoFileId!)).toBeNull();
  expect(await storedFileIds(orm)).toEqual([]);
});

test("keeps the logo removed when a pending lookup finishes", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const lookupStarted = Promise.withResolvers<void>();
  const lookup = Promise.withResolvers<{ name: string; logo: Buffer }>();
  const company = companyService(orm, {
    brandLookup: () => {
      lookupStarted.resolve();
      return lookup.promise;
    },
  });
  const pending = company.detectCompanyNameAndLogo(SYSTEM, {
    userId: actor.user!.userId,
    email: "owner@example.com",
  });
  await lookupStarted.promise;

  await company.removeLogo(actor);
  lookup.resolve({
    name: "Example Labs",
    logo,
  });
  await pending;

  expect((await company.getCompany(actor)).logoFileId).toBeNull();
});
