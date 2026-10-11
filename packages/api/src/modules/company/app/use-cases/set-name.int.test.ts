import { expect, test } from "#test/support";

import { createEventBus } from "../../../../core/events";
import { readOnboardingStep } from "../../../../core/instance";
import { createLogger } from "../../../../core/logger";
import { createCompanyUseCases } from ".";

test("saves the owner's company name and completes the company step", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const logger = createLogger("silent");
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => Promise.resolve(null),
  });

  const saved = await company.setName(actor, "Example Ltd");

  expect(saved.name).toBe("Example Ltd");
  expect((await company.getCompany(actor)).name).toBe("Example Ltd");
  expect(await readOnboardingStep(orm)).toBe("done");
});

test("renames the company after onboarding is done", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const logger = createLogger("silent");
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => Promise.resolve(null),
  });
  await company.setName(actor, "Example Ltd");

  const saved = await company.setName(actor, "Example Labs");

  expect(saved.name).toBe("Example Labs");
  expect((await company.getCompany(actor)).name).toBe("Example Labs");
  expect(await readOnboardingStep(orm)).toBe("done");
});

test("refuses a non-owner without changing the company or onboarding step", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const logger = createLogger("silent");
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => Promise.resolve(null),
  });
  const before = await company.getCompany(owner);

  await expect(
    company.setName({ userId: "another-user", isOwner: false }, "Example Ltd"),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the owner can do this." });

  expect(await company.getCompany(owner)).toEqual(before);
  expect(await readOnboardingStep(orm)).toBe("company");
});

test("requires sign-in without changing the company or onboarding step", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const logger = createLogger("silent");
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => Promise.resolve(null),
  });
  const before = await company.getCompany(owner);

  await expect(company.setName(null, "Example Ltd")).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Sign in to continue.",
  });

  expect(await company.getCompany(owner)).toEqual(before);
  expect(await readOnboardingStep(orm)).toBe("company");
});

test("leaves the company step unfinished when the name is invalid", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const logger = createLogger("silent");
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => Promise.resolve(null),
  });

  await expect(company.setName(actor, "   ")).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });

  expect((await company.getCompany(actor)).name).toBeNull();
  expect(await readOnboardingStep(orm)).toBe("company");
});
