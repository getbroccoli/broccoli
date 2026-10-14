import { expect, NON_OWNER, test } from "#test/support";

import { user } from "../../auth";
import { ormOf } from "../../db";
import { claimOwner, readOwnerUserId, readSetupStep } from ".";

test("refuses a non-owner claiming ownership without creating a user or advancing setup", async ({
  orm,
  transact,
}) => {
  await expect(
    transact((tx) =>
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
