import { companyUseCases, EMPLOYEE, expect, SETUP_HOLDER, SYSTEM, test } from "#test/support";

test("suggests a name from the owner's domain before the company is named", async ({
  orm,
  seed,
}) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example",
    logoFileId: null,
  });
});

test("suggests the stored brand name after owner setup", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm, {
    brandLookup: () => Promise.resolve({ name: "  Example Labs  ", logo: null }),
  });
  await company.detectCompanyNameAndLogo(SYSTEM, {
    userId: actor.user!.userId,
    email: "owner@example.com",
  });

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example Labs",
    logoFileId: null,
  });
});

test("returns no suggested name before an owner or brand exists", async ({ orm }) => {
  const company = companyUseCases(orm);

  expect(await company.getCompany(SETUP_HOLDER)).toEqual({
    name: null,
    suggestedName: null,
    logoFileId: null,
  });
});

test("allows an employee to read the company", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const company = companyUseCases(orm);
  await company.update(owner, { name: "Acme Corp" });

  expect(await company.getCompany(EMPLOYEE)).toMatchObject({ name: "Acme Corp" });
});
