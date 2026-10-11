import { companyUseCases, expect, test } from "#test/support";

test("suggests a name from the owner's domain before the company is named", async ({
  orm,
  seed,
}) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example",
    logoId: null,
  });
});

test("suggests the stored brand name after owner setup", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm, {
    brandLookup: () => Promise.resolve({ name: "  Example Labs  ", logo: null }),
  });
  await company.onOwnerClaimed({ userId: actor.userId, email: "owner@example.com" });

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example Labs",
    logoId: null,
  });
});
