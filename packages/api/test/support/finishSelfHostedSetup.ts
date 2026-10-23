import { user } from "../../src/core/auth";
import { ormOf, type Orm, type Tx } from "../../src/core/db";
import { type AddApprovedPeople, createOwnerAtSetup } from "../../src/core/instance/app";
import { TestSeed } from "./testSeed";
import { SYSTEM } from "./testSecurityContext";
import { testTransactor } from "./testTransactor";
import { importUseCases } from "./useCases";

/** Finishes the account step with the real owner and import operations. */
export async function finishSelfHostedSetup(orm: Orm): Promise<void> {
  await new TestSeed(orm).setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  await testTransactor(orm)((tx) => createSetupOwner(tx, importUseCases(orm).addApprovedPeople));
}

/** Creates the owner at the account step in `tx`, for the browser holding a seeded setup session. */
export function createSetupOwner(tx: Tx, addApprovedPeople: AddApprovedPeople) {
  return createOwnerAtSetup(
    SYSTEM,
    tx,
    { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") },
    async () => {
      const owner = { id: "setup-owner", name: "Owner", email: "owner@example.com" };
      await ormOf(tx).insert(user).values(owner);
      return { user: owner };
    },
    addApprovedPeople,
  );
}
