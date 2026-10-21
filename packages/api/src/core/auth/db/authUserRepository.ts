import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../db";
import { account, user } from "./schema";

/** Better Auth's users, for the few writes Broccoli makes outside Better Auth's own endpoints. */
export interface AuthUserRepository {
  /** The user linked to this account, or null. */
  findUserIdByAccount(account: LinkedAccount): Promise<string | null>;
  /** A user without a password, its email verified, linked to `account`. */
  createLinkedUser(
    details: { email: string; name: string } & LinkedAccount,
  ): Promise<{ id: string; email: string }>;
  /** The user's sign-in email, or null when no such user exists. */
  readEmail(userId: string): Promise<string | null>;
}

/** One way a user signs in: the provider and the user's id there. */
export interface LinkedAccount {
  providerId: string;
  accountId: string;
}

export function authUserRepository(db: Orm | Tx): AuthUserRepository {
  const orm = () => ormOf(db);

  return {
    findUserIdByAccount: async ({ providerId, accountId }) => {
      const [row] = await orm()
        .select({ userId: account.userId })
        .from(account)
        .where(and(eq(account.providerId, providerId), eq(account.accountId, accountId)));
      return row?.userId ?? null;
    },

    createLinkedUser: async ({ email, name, providerId, accountId }) => {
      const id = randomUUID();
      await orm().insert(user).values({ id, email, name, emailVerified: true });
      await orm().insert(account).values({ id: randomUUID(), userId: id, providerId, accountId });
      return { id, email };
    },

    readEmail: async (userId) => {
      const [row] = await orm().select({ email: user.email }).from(user).where(eq(user.id, userId));
      return row?.email ?? null;
    },
  };
}
