import { sql } from "drizzle-orm";
import { expect } from "vitest";

import type { Orm } from "../../src/core/db";

/** Waits until another connection is waiting for a lock the backend `blockingPid` holds. */
export async function expectBlockedBy(orm: Orm, blockingPid: number): Promise<void> {
  await expect
    .poll(async () => {
      const { rows } = await orm.execute<{ waiting: boolean }>(sql`
        select exists (select from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
            and ${blockingPid} = any(pg_blocking_pids(pid))) as waiting
      `);
      return rows[0]!.waiting;
    })
    .toBe(true);
}
