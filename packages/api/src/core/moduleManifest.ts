import type express from "express";

import type { Orm, Transact } from "./db";
import type { SetupDemo } from "./instance";
import type { EventHandlers } from "./events";
import type { JobHandlers, JobQueue } from "./jobs";
import type { Resolvers, SecurityResolver } from "./graphql";
import type { Logger } from "./logger";
import type { SecretBox } from "./secrets";

/**
 * The core's services for the modules. Each module factory takes only the ones it
 * uses (`Pick<ModuleDependencies, "orm">`) plus its own settings.
 */
export interface ModuleDependencies {
  dataDir: string;
  orm: Orm;
  transact: Transact;
  logger: Logger;
  /** Encrypts credentials the database stores, with the instance's encryption key. */
  secretBox: SecretBox;
  /** Queues background jobs inside a transaction. */
  jobs: JobQueue;
}

/**
 * Everything a module contributes to the API. The core iterates over the list of
 * manifests, so adding a module never means editing core code.
 */
export interface ModuleManifest {
  name: string;
  /** The module's GraphQL SDL. */
  typeDefs: string;
  resolvers: Resolvers;
  /** What the module does when another module's event happens. */
  events?: EventHandlers;
  /** The module's background jobs, run as the system. */
  jobs?: JobHandlers;
  /**
   * HTTP routes under `/api/` that GraphQL cannot serve, such as images; `publicOrigin` is the
   * origin browsers reach the instance at.
   */
  router?: (
    resolveSecurity: SecurityResolver,
    publicOrigin: (request: express.Request) => Promise<string>,
  ) => express.Router;
}

/** Every module of the API, and what self-hosted setup needs from them for the demo. */
export interface Modules {
  manifests: readonly ModuleManifest[];
  setupDemo: SetupDemo;
}
