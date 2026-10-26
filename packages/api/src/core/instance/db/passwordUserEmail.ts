import { and, eq } from "drizzle-orm";

import { account, user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";

/** The sign-in email of `userId` when the user has a password account, else null. */
export async function readPasswordUserEmail(db: Orm | Tx, userId: string): Promise<string | null> {
  const [row] = await ormOf(db)
    .select({ email: user.email })
    .from(user)
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .where(eq(user.id, userId));
  return row?.email ?? null;
}
