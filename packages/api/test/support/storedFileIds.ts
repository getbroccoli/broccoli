import { sql } from "drizzle-orm";

import type { Orm } from "../../src/core/db";

export async function storedFileIds(orm: Orm): Promise<string[]> {
  const { rows } = await orm.execute<{ id: string }>(sql`select id from files order by id`);
  return rows.map(({ id }) => id);
}
