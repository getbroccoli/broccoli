import { expect, test } from "#test/support";

import { createEventBus } from "../../../../core/events";
import { createLogger } from "../../../../core/logger";
import { createCompanyUseCases } from ".";

test("removes the logo and stops serving its old id", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const logger = createLogger("silent");
  const logo = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
    "hex",
  );
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => Promise.resolve({ name: "Example Labs", logo }),
  });
  await company.onOwnerClaimed({ userId: actor.userId, email: "owner@example.com" });
  const before = await company.getCompany(actor);
  expect(before.logoId).toEqual(expect.any(String));

  const removed = await company.removeLogo(actor);

  expect(removed).toEqual({ name: null, suggestedName: "Example Labs", logoId: null });
  expect((await company.getCompany(actor)).logoId).toBeNull();
  expect(await company.readLogo(actor, before.logoId!)).toBeNull();
});

test("keeps the logo removed when a pending lookup finishes", async ({ orm, seed }) => {
  const actor = await seed.owner();
  const logger = createLogger("silent");
  const lookupStarted = Promise.withResolvers<void>();
  const lookup = Promise.withResolvers<{ name: string; logo: Buffer }>();
  const company = createCompanyUseCases({
    orm,
    events: createEventBus(logger),
    logger,
    brandLookup: () => {
      lookupStarted.resolve();
      return lookup.promise;
    },
  });
  const pending = company.onOwnerClaimed({ userId: actor.userId, email: "owner@example.com" });
  await lookupStarted.promise;

  await company.removeLogo(actor);
  lookup.resolve({
    name: "Example Labs",
    logo: Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex"),
  });
  await pending;

  expect((await company.getCompany(actor)).logoId).toBeNull();
});
