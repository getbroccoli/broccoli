import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { toNodeHandler } from "better-auth/node";
import express from "express";
import { createRemoteJWKSet } from "jose";

import { resolveActor } from "./actor";
import { createAuth } from "./auth";
import { connectDatabase, type Database } from "./db";
import type { Env, ManagedEnv } from "./env";
import { createEventBus, type EventBus } from "./events";
import { type ActorResolver, startGraphqlApi, type GraphqlApi } from "./graphql";
import { healthRouter } from "./health";
import { setupPlugin } from "./instance";
import type { Logger } from "./logger";
import {
  callbackOnlyTrust,
  fixedAuth,
  initRouter,
  managedAuth,
  managedSignInPlugin,
  waitingGate,
  type AuthSource,
} from "./managedSignIn";
import type { ModuleDependencies, ModuleManifest } from "./moduleManifest";
import { Readiness } from "./readiness";
import { readOrCreateSecret } from "./secrets";

/** How long to wait before retrying failed migrations, e.g. while Postgres boots. */
const MIGRATION_RETRY_MS = 1_000;

export type ServerEnv = Pick<
  Env,
  "databaseUrl" | "port" | "webDir" | "mode" | "dataDir" | "publicUrl" | "managed"
>;

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
  const authSecret = await readOrCreateSecret(env.dataDir, "auth-secret");
  const database = connectDatabase(env.databaseUrl, logger);
  const eventBus = createEventBus(logger);
  const authServices = { orm: database.orm, eventBus, secret: authSecret, logger };
  const issuer = env.managed && accountsIssuer(env.managed);
  const auth = issuer
    ? managedAuthSource(authServices, issuer)
    : selfHostedAuthSource(authServices, env.publicUrl);
  const resolveActorOf: ActorResolver = async (headers) => {
    const current = await auth.current();
    return current
      ? resolveActor(current, database.orm, headers)
      : { actor: null, renewedCookies: [] };
  };
  const readiness = new Readiness(() => database.checkConnection());

  const app = express();
  app.disable("x-powered-by");
  const httpServer = createServer(app);
  let modules: readonly ModuleManifest[];
  let graphql: GraphqlApi;
  try {
    modules = createModules({ orm: database.orm, eventBus, logger });
    graphql = await startGraphqlApi(modules, httpServer, logger, resolveActorOf);
  } catch (error) {
    await database.close();
    throw error;
  }
  app.use(healthRouter(readiness, issuer ? () => initStatus(auth) : undefined));
  if (issuer) {
    const tokenCheck = { ...issuer, audience: `instance:${issuer.instanceId}` };
    app.use(initRouter({ orm: database.orm, eventBus, tokenCheck, readiness, auth }));
    app.use(waitingGate(auth));
  }
  // Better Auth reads the raw body, so no body parser may run before it.
  app.all("/api/auth/{*path}", async (request, response) => {
    // In managed mode the waiting gate has already answered while there is no auth.
    const current = await auth.current();
    await toNodeHandler(current!)(request, response);
  });
  app.use(graphql.router);
  for (const module of modules) {
    if (module.events) {
      eventBus.subscribe(module.events);
    }
    if (module.router) {
      app.use("/api", module.router(resolveActorOf));
    }
  }
  if (webApp) {
    app.use(webApp);
  }
  try {
    await listen(httpServer, env.port);
  } catch (error) {
    await graphql.stop();
    await database.close();
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

interface AuthServices {
  orm: Database["orm"];
  eventBus: EventBus;
  /** Signs session cookies. */
  secret: string;
  logger: Logger;
}

/** Who signs a managed instance's init tokens and tickets, and the slot they address. */
interface AccountsIssuer {
  instanceId: string;
  issuer: string;
  keys: ReturnType<typeof createRemoteJWKSet>;
}

function accountsIssuer({ instanceId, accountsOrigin }: ManagedEnv): AccountsIssuer {
  return {
    instanceId,
    issuer: accountsOrigin,
    keys: createRemoteJWKSet(new URL("/.well-known/jwks.json", accountsOrigin)),
  };
}

/** The first visitor creates the owner with a password. */
function selfHostedAuthSource(services: AuthServices, publicUrl: string | undefined): AuthSource {
  return fixedAuth(
    createAuth({
      ...services,
      publicUrl,
      plugins: [setupPlugin(services.orm, services.eventBus)],
    }),
  );
}

/** Built once init has assigned the instance; people sign in with accounts tickets. */
function managedAuthSource(services: AuthServices, { issuer, keys }: AccountsIssuer): AuthSource {
  return managedAuth(services.orm, (assignment) =>
    createAuth({
      ...services,
      publicUrl: assignment.publicOrigin,
      plugins: [managedSignInPlugin({ ...services, assignment, tokenCheck: { issuer, keys } })],
      trustedOrigins: callbackOnlyTrust(assignment),
    }),
  );
}

async function initStatus(auth: AuthSource): Promise<"waiting" | "ready"> {
  return (await auth.current()) ? "ready" : "waiting";
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
