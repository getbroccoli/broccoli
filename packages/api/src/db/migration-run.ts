import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Resolves to `packages/api/drizzle` from both `src/db` and `dist/db`. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));
export const MIGRATION_LOCK_KEY = "broccoli.migrations";

/**
 * One migration run on a dedicated connection. It holds a session-level advisory
 * lock, so instances that start together migrate one after another; ending the
 * connection releases the lock and rolls back an unfinished migration.
 */
export class MigrationRun {
  readonly #client: pg.Client;
  readonly #connected: Promise<pg.Client>;

  constructor(config: pg.ClientConfig) {
    this.#client = new pg.Client(config);
    // A dropped connection also rejects the pending query; this listener only keeps
    // the client's `error` event from crashing the process.
    this.#client.on("error", () => {});
    this.#connected = this.#client.connect();
  }

  async apply(): Promise<void> {
    try {
      await this.#connected;
      await this.#client.query("select pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
      await migrate(drizzle({ client: this.#client }), {
        migrationsFolder: MIGRATIONS_FOLDER,
      });
    } finally {
      await this.#client.end();
    }
  }

  /** Ends the connection, which makes a pending `apply()` reject. */
  async abort(): Promise<void> {
    // node-postgres cannot end a client that is still connecting.
    await this.#connected.catch(() => {});
    await this.#client.end();
  }
}
