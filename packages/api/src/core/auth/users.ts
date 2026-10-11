import { eq } from "drizzle-orm";

import type { Orm } from "../db";
import { user } from "./schema";

/** The sign-in email of an existing user, lowercased. */
export async function readUserEmail(orm: Orm, userId: string): Promise<string> {
  const [row] = await orm.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!row) {
    throw new Error(`No user with id ${userId}`);
  }
  return row.email;
}
