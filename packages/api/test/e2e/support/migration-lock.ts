import pg from "pg";

import { MIGRATION_LOCK_KEY } from "../../../src/db/migration-run.js";

/** Holds the migration lock the way a competing instance would while migrating. */
export interface MigrationLockHolder {
  /** Whether another session is waiting for the lock. */
  hasWaitingSession(): Promise<boolean>;
  release(): Promise<void>;
}

export async function holdMigrationLock(databaseUrl: string): Promise<MigrationLockHolder> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("select pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);

  return {
    hasWaitingSession: async () => {
      const { rows } = await client.query<{ waiting: boolean }>(
        `select exists (
           select from pg_stat_activity
            where datname = current_database() and wait_event = 'advisory'
         ) as waiting`,
      );
      return rows[0]?.waiting ?? false;
    },
    release: () => client.end(),
  };
}
