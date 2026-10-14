import { expect, NON_OWNER, test } from "#test/support";

import { user } from "../../auth";
import { ormOf, runInTransaction } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import { claimOwner, readOwnerUserId, readSetupStep } from ".";

test("refuses a non-owner claiming ownership without creating a user or advancing setup", async ({
  orm,
}) => {
  const eventBus = createEventBus(createLogger("silent"));

  await expect(
    runInTransaction(orm, eventBus, (tx) =>
      claimOwner(NON_OWNER, tx, async () => {
        const owner = { id: "owner-1", name: "Owner", email: "owner@example.com" };
        await ormOf(tx).insert(user).values(owner);
        return { user: owner };
      }),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await readOwnerUserId(orm)).toBeNull();
  expect(await readSetupStep(orm)).toBe("owner");
  expect(await orm.select().from(user)).toEqual([]);
});
