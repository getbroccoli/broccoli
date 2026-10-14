import type express from "express";

import type { Orm } from "./db";
import type { EventBus, EventHandlers } from "./events";
import type { Resolvers, SecurityResolver } from "./graphql";
import type { Logger } from "./logger";
import type { Encryption } from "./secrets";

/**
 * The core's services for the modules. Each module factory takes only the ones it
 * uses (`Pick<ModuleDependencies, "orm">`) plus its own settings.
 */
export interface ModuleDependencies {
  orm: Orm;
  eventBus: EventBus;
  logger: Logger;
  /** Encrypts credentials the database stores, with the instance's encryption key. */
  encryption: Encryption;
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
  /** HTTP routes under `/api/` that GraphQL cannot serve, such as images. */
  router?: (resolveSecurity: SecurityResolver) => express.Router;
}
