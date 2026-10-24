import { inArray } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";

/** The current email of each of these users that still exists, by user id. */
export async function findUserEmails(
  db: Orm | Tx,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const rows = await ormOf(db)
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, [...userIds]));
  return new Map(rows.map(({ id, email }) => [id, email]));
}
