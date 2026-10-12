import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { account, user } from "../../auth";
import { ormOf, type Tx } from "../../db";
import type { ManagedTicket } from "../domain";

/** Accounts linked to the accounts service: one per subject, never matched by email. */
export const MANAGED_PROVIDER_ID = "broccoli-accounts";

/** Users who sign in through the accounts service, inside a transaction. */
export function managedAccountRepository(tx: Tx) {
  const orm = () => ormOf(tx);

  return {
    findUserId: async (subject: string): Promise<string | null> => {
      const [row] = await orm()
        .select({ userId: account.userId })
        .from(account)
        .where(and(eq(account.providerId, MANAGED_PROVIDER_ID), eq(account.accountId, subject)));
      return row?.userId ?? null;
    },

    /** A user without a password, linked to the ticket's subject. */
    createUser: async ({
      subject,
      email,
      name,
    }: ManagedTicket): Promise<{ id: string; email: string }> => {
      const id = randomUUID();
      await orm().insert(user).values({ id, email, name, emailVerified: true });
      await orm().insert(account).values({
        id: randomUUID(),
        userId: id,
        providerId: MANAGED_PROVIDER_ID,
        accountId: subject,
      });
      return { id, email };
    },
  };
}
