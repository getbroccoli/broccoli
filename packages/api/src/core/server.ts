import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import express from "express";

import { authHandler } from "./auth";
import { connectDatabase, type Database, transactor } from "./db";
import type { Env } from "./env";
import { createEventBus } from "./events";
import { type GraphqlApi, type SecurityResolver, startGraphqlApi } from "./graphql";
import { healthRouter } from "./health";
import { selfHostedAuth } from "./instance";
import type { Logger } from "./logger";
import { managedServer, type ManagedServer } from "./managedSignIn";
import type { ModuleDependencies, ModuleManifest } from "./moduleManifest";
import { Readiness } from "./readiness";
import { createSecretBox, ensureSecret } from "./secrets";
import { resolveSecurityContext } from "./sessionSecurity";

/** How long to wait before retrying failed migrations, e.g. while Postgres boots. */
const MIGRATION_RETRY_MS = 1_000;

export type ServerEnv = Pick<Env, "databaseUrl" | "port" | "webDir" | "deployment" | "dataDir">;

export interface RunningServer {
  url: string;
  /**
   * Stops accepting requests and closes the database, aborting a migration that is
   * still running; safe to call more than once.
   */
  stop(): Promise<void>;
}

/**
 * Starts listening at once and migrates the database in the background, retrying
 * until it succeeds; `/readyz` reports ready when the migrations have succeeded.
 */
export async function startServer(
  env: ServerEnv,
  logger: Logger,
  createModules: (dependencies: ModuleDependencies) => readonly ModuleManifest[],
): Promise<RunningServer> {
  // Built first: a web app folder without `index.html` fails startup before anything opens.
  const webApp = env.webDir ? webAppRouter(env.webDir) : undefined;
  const authSecret = await ensureSecret(env.dataDir, "auth-secret");
  const secretBox = createSecretBox(await ensureSecret(env.dataDir, "encryption-key"));
  const database = connectDatabase(env.databaseUrl, logger);
  const eventBus = createEventBus(logger);
  const transact = transactor(database.orm, eventBus);
  const readiness = new Readiness(() => database.checkConnection());
  const services = { orm: database.orm, transact, secret: authSecret, logger };
  // Self-hosted instances add only their auth; managed ones also init routes and status.
  const deploymentParts: Pick<ManagedServer, "auth"> & Partial<ManagedServer> =
    env.deployment.mode === "managed"
      ? managedServer({ ...services, deployment: env.deployment, readiness })
      : { auth: selfHostedAuth({ ...services, publicUrl: env.deployment.publicUrl }) };
  const resolveSecurity: SecurityResolver = (headers) =>
    resolveSecurityContext(deploymentParts.auth, database.orm, headers);

  const app = express();
  app.disable("x-powered-by");
  const httpServer = createServer(app);
  let modules: readonly ModuleManifest[];
  let graphql: GraphqlApi;
  try {
    modules = createModules({ orm: database.orm, transact, logger, secretBox });
    graphql = await startGraphqlApi(modules, httpServer, logger, resolveSecurity);
  } catch (error) {
    await database.close();
    throw error;
  }
  try {
    app.use(healthRouter(readiness, deploymentParts.initStatus));
    if (deploymentParts.router) {
      app.use(deploymentParts.router);
    }
    app.all("/api/auth/{*path}", authHandler(deploymentParts.auth));
    app.use(graphql.router);
    for (const module of modules) {
      if (module.events) {
        eventBus.subscribe(module.events);
      }
      if (module.router) {
        app.use("/api", module.router(resolveSecurity));
      }
    }
    if (webApp) {
      app.use(webApp);
    }
    await listen(httpServer, env.port);
  } catch (error) {
    await closeAfterFailedStart(graphql, database);
    throw error;
  }

  const stopped = new AbortController();
  const migration = migrate(database, readiness, logger, stopped.signal);
  let stopping: Promise<void> | undefined;

  return {
    url: `http://localhost:${(httpServer.address() as AddressInfo).port}`,
    stop: () => {
      stopping ??= (async () => {
        stopped.abort();
        // Drains in-flight requests, then closes the HTTP server.
        await graphql.stop();
        await database.close();
        await migration;
      })();
      return stopping;
    },
  };
}

/** Stops what startup opened; the pool closes even when Apollo fails to stop. */
async function closeAfterFailedStart(graphql: GraphqlApi, database: Database): Promise<void> {
  try {
    await graphql.stop();
  } finally {
    await database.close();
  }
}

async function migrate(
  database: Database,
  readiness: Readiness,
  logger: Logger,
  stopped: AbortSignal,
): Promise<void> {
  while (!stopped.aborted) {
    try {
      await database.migrate();
      readiness.markMigrated();
      logger.info("Database migrations applied");
      return;
    } catch (error) {
      if (stopped.aborted) {
        return;
      }
      readiness.markFailed();
      logger.error({ err: error }, "Database migrations failed; not ready, retrying");
    }
    await delay(MIGRATION_RETRY_MS, undefined, { signal: stopped }).catch(() => {});
  }
}

/** Serves the built web app; other GET paths outside `/api` get `index.html` so router links load. */
function webAppRouter(webDir: string): express.Router {
  // `resolve` lets the folder be relative and sit inside hidden parent folders.
  const root = resolve(webDir);
  // Read once, so a page link costs no file system access.
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");
  const router = express.Router().use(express.static(root));
  // API paths never get the web app, so an unknown one answers 404.
  router.use("/api", (_request, _response, next) => next("router"));
  return router.get("/{*path}", (_request, response) => {
    response.type("html").send(indexHtml);
  });
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
