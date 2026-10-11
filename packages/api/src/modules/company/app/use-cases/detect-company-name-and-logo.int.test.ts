import { companyUseCases, expect, test } from "#test/support";

import { createLogger } from "../../../../core/logger";

const logo = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

test("stores the brand name and logo found for the owner's domain", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const domains: string[] = [];
  const company = companyUseCases(orm, {
    brandLookup: (domain) => {
      domains.push(domain);
      return Promise.resolve({ name: "Example Labs", logo });
    },
  });

  await company.detectCompanyNameAndLogo({ userId: actor.userId, email: "owner@example.com" });

  const saved = await company.getCompany(actor);
  expect(domains).toEqual(["example.com"]);
  expect(saved.suggestedName).toBe("Example Labs");
  expect(saved.logoId).toEqual(expect.any(String));
  expect(await company.readLogo(actor, saved.logoId!)).toEqual({
    bytes: logo,
    mimeType: "image/png",
  });
});

test("keeps the domain suggestion and no logo when no brand is found", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const company = companyUseCases(orm);

  await company.detectCompanyNameAndLogo({ userId: actor.userId, email: "owner@example.com" });

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example",
    logoId: null,
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

  await company.detectCompanyNameAndLogo({ userId: actor.userId, email: "owner@gmail.com" });

  expect(domains).toEqual([]);
  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: null,
    logoId: null,
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
    company.detectCompanyNameAndLogo({ userId: actor.userId, email: "owner@example.com" }),
  ).resolves.toBeUndefined();

  expect(await company.getCompany(actor)).toEqual({
    name: null,
    suggestedName: "Example",
    logoId: null,
  });
  expect(logs.length).toBeGreaterThan(0);
});

test("does not restore a removed logo when owner setup is delivered again", async ({
  orm,
  seed,
}) => {
  const actor = await seed.owner();
  const owner = { userId: actor.userId, email: "owner@example.com" };
  const company = companyUseCases(orm, {
    brandLookup: () => Promise.resolve({ name: "Example Labs", logo }),
  });
  await company.detectCompanyNameAndLogo(owner);
  const before = await company.getCompany(actor);
  expect(before.logoId).toEqual(expect.any(String));
  await company.removeLogo(actor);

  await company.detectCompanyNameAndLogo(owner);

  expect((await company.getCompany(actor)).logoId).toBeNull();
  expect(await company.readLogo(actor, before.logoId!)).toBeNull();
});
