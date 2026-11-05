import { user } from "../../src/core/auth";
import { ormOf, type Orm, type Tx } from "../../src/core/db";
import { NO_SETUP_INVITES, type SetupChoices, type SetupInvite } from "../../src/core/instance";
import { type AddApprovedPeople } from "../../src/core/instance/app";
import { TestSeed } from "./testSeed";
import { SYSTEM } from "./testSecurityContext";
import { transactWithTimeOffEvents } from "./timeOffService";
import { importServices } from "./services";
import { owners } from "./statelessServices";

/** Finishes the account step with the real owner and import operations. */
export async function finishSelfHostedSetup(
  orm: Orm,
  choices: Partial<SetupChoices> = {},
): Promise<SetupInvite[]> {
  await new TestSeed(orm).setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const { invites } = await transactWithTimeOffEvents(orm)((tx) =>
    createSetupOwner(tx, importServices(orm).addApprovedPeople, choices),
  );
  return invites;
}

/** Creates the owner at the account step in `tx`, for the browser holding a seeded setup session. */
export function createSetupOwner(
  tx: Tx,
  addApprovedPeople: AddApprovedPeople,
  choices: Partial<SetupChoices> = {},
) {
  return owners.createOwnerAtSetup(
    SYSTEM,
    tx,
    { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") },
    async () => {
      const owner = { id: "setup-owner", name: "Owner", email: "owner@example.com" };
      await ormOf(tx).insert(user).values(owner);
      return { user: owner };
    },
    addApprovedPeople,
    { ...NO_SETUP_INVITES, ...choices, linkOrigin: "https://broccoli.example.com" },
  );
}
