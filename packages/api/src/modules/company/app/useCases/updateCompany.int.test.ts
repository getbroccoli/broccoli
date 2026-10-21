import { companyUseCases, expect, NON_OWNER, SETUP_HOLDER, test } from "#test/support";

import { readInstance } from "../../../../core/instance";

test("saves the owner's company name and moves setup on to the import step", async ({
  orm,
  seed,
}) => {
  const ctx = await seed.owner();
  const company = companyUseCases(orm);

  const saved = await company.update(ctx, { name: "  Example Ltd  " });

  expect(saved.name).toBe("Example Ltd");
  expect((await company.getCompany(ctx)).name).toBe("Example Ltd");
  expect((await readInstance(orm)).setupStep).toBe("import");
});

test("renames the company after setup is done", async ({ orm, seed }) => {
  const ctx = await seed.owner();
  const company = companyUseCases(orm);
  await company.update(ctx, { name: "Example Ltd" });
  await seed.setupStep("done");

  const saved = await company.update(ctx, { name: "Example Labs" });

  expect(saved.name).toBe("Example Labs");
  expect((await company.getCompany(ctx)).name).toBe("Example Labs");
  expect((await readInstance(orm)).setupStep).toBe("done");
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
  expect((await readInstance(orm)).setupStep).toBe("company");
});

test("leaves the company step unfinished when the name is invalid", async ({ orm, seed }) => {
  const ctx = await seed.owner();
  const company = companyUseCases(orm);

  await expect(company.update(ctx, { name: "   " })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect((await company.getCompany(ctx)).name).toBeNull();
  expect((await readInstance(orm)).setupStep).toBe("company");
});

test("the setup holder names the company without an owner and moves setup to import", async ({
  orm,
}) => {
  const company = companyUseCases(orm);

  const saved = await company.update(SETUP_HOLDER, { name: "Acme Corp" });

  expect(saved.name).toBe("Acme Corp");
  expect((await company.getCompany(SETUP_HOLDER)).name).toBe("Acme Corp");
  expect((await readInstance(orm)).setupStep).toBe("import");
});
