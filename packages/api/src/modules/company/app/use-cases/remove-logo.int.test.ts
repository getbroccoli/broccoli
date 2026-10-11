import { companyUseCases, expect, PNG as logo, test } from "#test/support";

test("removes the logo and stops serving its old id", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm, {
    brandLookup: () => Promise.resolve({ name: "Example Labs", logo }),
  });
  await company.detectCompanyNameAndLogo({ userId: actor.userId, email: "owner@example.com" });
  const before = await company.getCompany(actor);
  expect(before.logoId).toEqual(expect.any(String));

  const removed = await company.removeLogo(actor);

  expect(removed).toEqual({ name: null, suggestedName: "Example Labs", logoId: null });
  expect((await company.getCompany(actor)).logoId).toBeNull();
  expect(await company.readLogo(actor, before.logoId!)).toBeNull();
});

test("keeps the logo removed when a pending lookup finishes", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const lookupStarted = Promise.withResolvers<void>();
  const lookup = Promise.withResolvers<{ name: string; logo: Buffer }>();
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
  await lookupStarted.promise;

  await company.removeLogo(actor);
  lookup.resolve({
    name: "Example Labs",
    logo,
  });
  await pending;

  expect((await company.getCompany(actor)).logoId).toBeNull();
});
