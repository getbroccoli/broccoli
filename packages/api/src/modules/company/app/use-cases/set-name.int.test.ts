import { companyUseCases, expect, test } from "#test/support";

import { readSetupStep } from "../../../../core/instance";

test("saves the owner's company name and completes the company step", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  const saved = await company.setName(actor, "Example Ltd");

  expect(saved.name).toBe("Example Ltd");
  expect((await company.getCompany(actor)).name).toBe("Example Ltd");
  expect(await readSetupStep(orm)).toBe("done");
});

test("renames the company after setup is done", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);
  await company.setName(actor, "Example Ltd");

  const saved = await company.setName(actor, "Example Labs");

  expect(saved.name).toBe("Example Labs");
  expect((await company.getCompany(actor)).name).toBe("Example Labs");
  expect(await readSetupStep(orm)).toBe("done");
});

test("refuses a non-owner without changing the company or setup step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.getCompany(owner);

  await expect(
    company.setName({ userId: "another-user", isOwner: false }, "Example Ltd"),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the owner can do this." });

  expect(await company.getCompany(owner)).toEqual(before);
  expect(await readSetupStep(orm)).toBe("company");
});

test("requires sign-in without changing the company or setup step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const company = companyUseCases(orm);
  const before = await company.getCompany(owner);

  await expect(company.setName(null, "Example Ltd")).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Sign in to continue.",
  });

  expect(await company.getCompany(owner)).toEqual(before);
  expect(await readSetupStep(orm)).toBe("company");
});

test("leaves the company step unfinished when the name is invalid", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  await expect(company.setName(actor, "   ")).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect((await company.getCompany(actor)).name).toBeNull();
  expect(await readSetupStep(orm)).toBe("company");
});
