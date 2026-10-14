import { companyUseCases, expect, NON_OWNER, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";

test("saves the owner's company name and moves setup on to the import step", async ({
  orm,
  seed,
}) => {
  const ctx = await seed.owner();
  const company = companyUseCases(orm);

  const saved = await company.update(ctx, { name: "  Example Ltd  " });

  expect(saved.name).toBe("Example Ltd");
  expect((await company.getCompany(ctx)).name).toBe("Example Ltd");
  expect(await readSetupStep(orm)).toBe("import");
});

test("renames the company after setup is done", async ({ orm, seed }) => {
  const ctx = await seed.owner();
  const company = companyUseCases(orm);
  await company.update(ctx, { name: "Example Ltd" });
  await instanceRepository(orm).setOwner(ctx.user!.userId, "done");

  const saved = await company.update(ctx, { name: "Example Labs" });

  expect(saved.name).toBe("Example Labs");
  expect((await company.getCompany(ctx)).name).toBe("Example Labs");
  expect(await readSetupStep(orm)).toBe("done");
});

test("refuses a non-owner without changing the company or setup step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.getCompany(owner);

  await expect(company.update(NON_OWNER, { name: "Example Ltd" })).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
  });

  expect(await company.getCompany(owner)).toEqual(before);
  expect(await readSetupStep(orm)).toBe("company");
});

test("leaves the company step unfinished when the name is invalid", async ({ orm, seed }) => {
  const ctx = await seed.owner();
  const company = companyUseCases(orm);

  await expect(company.update(ctx, { name: "   " })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect((await company.getCompany(ctx)).name).toBeNull();
  expect(await readSetupStep(orm)).toBe("company");
});
