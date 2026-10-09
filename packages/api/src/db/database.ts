import pg from "pg";

import type { Logger } from "../logger.js";
import { MigrationRun } from "./migration-run.js";

const CONNECTION_TIMEOUT_MS = 5_000;
const CONNECTION_CHECK_TIMEOUT_MS = 2_000;

/**
 * node-postgres honours `query_timeout` per query, but its types omit it. On timeout
 * the pool discards the connection, so a stalled socket cannot stay checked out.
 */
const CONNECTION_CHECK_QUERY = {
  text: "select 1",
  query_timeout: CONNECTION_CHECK_TIMEOUT_MS,
};

export interface Database {
  /** Applies pending migrations; safe to call from several instances at once. */
  migrate(): Promise<void>;
  /** Resolves when the database answers a query within a short timeout. */
  checkConnection(): Promise<void>;
  /** Closes all connections and aborts a migration that is still running. */
  close(): Promise<void>;
}

export function connectDatabase(url: string, logger: Logger): Database {
  const connection = {
    connectionString: url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  };
  const pool = new pg.Pool(connection);
  pool.on("error", (error) => {
    logger.warn({ err: error }, "Idle database connection failed");
  });
  let migration: MigrationRun | undefined;

  return {
    migrate: async () => {
      migration = new MigrationRun(connection);
      try {
        await migration.apply();
      } finally {
        migration = undefined;
      }
    },
    checkConnection: async () => {
      await pool.query(CONNECTION_CHECK_QUERY);
    },
    close: async () => {
      await migration?.abort();
      await pool.end();
    },
  };
}
