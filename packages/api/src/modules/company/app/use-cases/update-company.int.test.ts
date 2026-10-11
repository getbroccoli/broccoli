import { companyUseCases, expect, test } from "#test/support";

import { readSetupStep } from "../../../../core/instance";

test("saves the owner's company name and completes the company step", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  const saved = await company.update(actor, { name: "  Example Ltd  " });

  expect(saved.name).toBe("Example Ltd");
  expect((await company.getCompany(actor)).name).toBe("Example Ltd");
  expect(await readSetupStep(orm)).toBe("done");
});

test("renames the company after setup is done", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  await company.update(actor, { name: "Example Ltd" });

  const saved = await company.update(actor, { name: "Example Labs" });

  expect(saved.name).toBe("Example Labs");
  expect((await company.getCompany(actor)).name).toBe("Example Labs");
  expect(await readSetupStep(orm)).toBe("done");
});

test("refuses a non-owner without changing the company or setup step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.getCompany(owner);

  await expect(
    company.update({ userId: "another-user", isOwner: false }, { name: "Example Ltd" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the owner can do this." });

  expect(await company.getCompany(owner)).toEqual(before);
  expect(await readSetupStep(orm)).toBe("company");
});

test("leaves the company step unfinished when the name is invalid", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  await expect(company.update(actor, { name: "   " })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect((await company.getCompany(actor)).name).toBeNull();
  expect(await readSetupStep(orm)).toBe("company");
});
