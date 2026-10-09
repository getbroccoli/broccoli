export type ReadinessStatus = "starting" | "ready" | "unavailable";

type StartupState = "migrating" | "migrated" | "failed";

/** Answers readiness probes: ready only after migrations succeed and while the database responds. */
export class Readiness {
  readonly #checkDatabase: () => Promise<void>;
  #startup: StartupState = "migrating";

  constructor(checkDatabase: () => Promise<void>) {
    this.#checkDatabase = checkDatabase;
  }

  markMigrated(): void {
    this.#startup = "migrated";
  }

  markFailed(): void {
    this.#startup = "failed";
  }

  async check(): Promise<ReadinessStatus> {
    if (this.#startup === "migrating") {
      return "starting";
    }
    if (this.#startup === "failed") {
      return "unavailable";
    }
    return (await this.#isDatabaseReachable()) ? "ready" : "unavailable";
  }

  async #isDatabaseReachable(): Promise<boolean> {
    try {
      await this.#checkDatabase();
      return true;
    } catch {
      return false;
    }
  }
}
