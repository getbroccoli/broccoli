import { companyUseCases, expect, PNG as logo, SYSTEM, test } from "#test/support";

import { instanceRepository } from "../../../../core/instance";
import { createLogger } from "../../../../core/logger";

test("stores the brand name and logo found for the owner's domain", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const domains: string[] = [];
  const company = companyUseCases(orm, {
    brandLookup: (domain) => {
      domains.push(domain);
      return Promise.resolve({ name: "Example Labs", logo });
    },
  });

  await company.detectCompanyNameAndLogo(SYSTEM, {
    userId: actor.user!.userId,
    email: "owner@example.com",
  });

  const saved = await company.getCompany(actor);
  expect(domains).toEqual(["example.com"]);
  expect(saved.suggestedName).toBe("Example Labs");
  expect(saved.logoFileId).toEqual(expect.any(String));
  expect(await company.isCurrentLogo(actor, saved.logoFileId!)).toBe(true);
});

test("keeps the domain suggestion and no logo when no brand is found", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  await company.detectCompanyNameAndLogo(SYSTEM, {
    userId: actor.user!.userId,
    email: "owner@example.com",
  });

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example",
    logoFileId: null,
  });
});

test("does not look up a personal email domain", async ({ orm, seed }) => {
  const actor = await seed.owner({ email: "owner@gmail.com" });
  const domains: string[] = [];
  const company = companyUseCases(orm, {
    brandLookup: (domain) => {
      domains.push(domain);
      return Promise.resolve(null);
    },
  });

  await company.detectCompanyNameAndLogo(SYSTEM, {
    userId: actor.user!.userId,
    email: "owner@gmail.com",
  });

  expect(domains).toEqual([]);
  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: null,
    logoFileId: null,
  });
});

test("logs a failed lookup and resolves without storing a brand", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const logs: string[] = [];
  const logger = createLogger("warn", {
    write: (line) => {
      logs.push(line);
    },
  });
  const company = companyUseCases(orm, {
    logger,
    brandLookup: () => Promise.reject(new Error("Brand service unavailable")),
  });

  await expect(
    company.detectCompanyNameAndLogo(SYSTEM, {
      userId: actor.user!.userId,
      email: "owner@example.com",
    }),
  ).resolves.toBeUndefined();

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example",
    logoFileId: null,
  });
  expect(logs.length).toBeGreaterThan(0);
});

test("does not restore a removed logo when owner setup is delivered again", async ({
  orm,
  seed,
}) => {
  const actor = await seed.owner();
  const owner = { userId: actor.user!.userId, email: "owner@example.com" };
  const company = companyUseCases(orm, {
    brandLookup: () => Promise.resolve({ name: "Example Labs", logo }),
  });
  await company.detectCompanyNameAndLogo(SYSTEM, owner);
  const before = await company.getCompany(actor);
  expect(before.logoFileId).toEqual(expect.any(String));
  await company.removeLogo(actor);

  await company.detectCompanyNameAndLogo(SYSTEM, owner);

  expect((await company.getCompany(actor)).logoFileId).toBeNull();
  expect(await company.isCurrentLogo(actor, before.logoFileId!)).toBe(false);
});

test.for(["import", "owner", "done"] as const)(
  "does not look up the brand at the %s step",
  async (step, { orm, seed }) => {
    const actor = await seed.owner();
    await instanceRepository(orm).advanceStep("company", step);
    const domains: string[] = [];
    const company = companyUseCases(orm, {
      brandLookup: (domain) => {
        domains.push(domain);
        return Promise.resolve({ name: "Acme Corp", logo });
      },
    });

    await company.detectCompanyNameAndLogo(SYSTEM, {
      userId: actor.user!.userId,
      email: "owner@example.com",
    });

    expect(domains).toEqual([]);
    expect((await company.getCompany(actor)).logoFileId).toBeNull();
  },
);
