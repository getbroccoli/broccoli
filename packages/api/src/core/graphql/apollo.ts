import type { IncomingHttpHeaders, Server } from "node:http";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import express from "express";
import { GraphQLError } from "graphql";

import type { Actor } from "../actor";
import type { Logger } from "../logger";
import type { ModuleManifest } from "../module-manifest";
import { depthLimit } from "./depth-limit";
import { errorLoggingPlugin } from "./error-logging";
import { formatError } from "./errors";
import { DateScalar, DateTimeScalar } from "./scalars";
import { readSdl } from "./sdl";
import { singleMutationField } from "./single-mutation-field";

/** Deepest field nesting a request may use. */
export const MAX_DEPTH = 10;
/** Largest document the parser accepts; also bounds wide queries such as alias floods. */
export const MAX_TOKENS = 2000;

/** What every resolver receives as its context. */
export interface GraphqlContext {
  /** The signed-in user, or null for an anonymous request. */
  actor: Actor | null;
}

export type ActorResolver = (headers: IncomingHttpHeaders) => Promise<Actor | null>;

/** Scalars and types that every module may use. */
const CORE_TYPE_DEFS = readSdl(import.meta.url, "./schema.graphql");
const CORE_RESOLVERS = { Date: DateScalar, DateTime: DateTimeScalar };

export interface GraphqlApi {
  /** Serves `POST /api/graphql`. */
  router: express.Router;
  /** Drains in-flight requests and closes the HTTP server. */
  stop(): Promise<void>;
}

/** Builds the schema from the module manifests and starts Apollo Server. */
export async function startGraphqlApi(
  manifests: readonly ModuleManifest[],
  httpServer: Server,
  logger: Logger,
  resolveActor: ActorResolver,
): Promise<GraphqlApi> {
  const apollo = new ApolloServer<GraphqlContext>({
    schema: makeExecutableSchema({
      typeDefs: [CORE_TYPE_DEFS, ...manifests.map((manifest) => manifest.typeDefs)],
      resolvers: [CORE_RESOLVERS, ...manifests.map((manifest) => manifest.resolvers)],
    }),
    parseOptions: { maxTokens: MAX_TOKENS },
    validationRules: [depthLimit(MAX_DEPTH), singleMutationField],
    introspection: false,
    includeStacktraceInErrorResponses: false,
    formatError,
    // main.ts owns SIGINT and SIGTERM.
    stopOnTerminationSignals: false,
    plugins: [
      ApolloServerPluginLandingPageDisabled(),
      ApolloServerPluginDrainHttpServer({ httpServer }),
      errorLoggingPlugin(logger),
    ],
  });
  await apollo.start();

  return {
    router: express
      .Router()
      .use(
        "/api/graphql",
        express.json(),
        expressMiddleware(apollo, { context: createContext(resolveActor) }),
      ),
    stop: () => apollo.stop(),
  };
}

/** Builds each request's context; a failure becomes a masked internal error. */
export function createContext(resolveActor: ActorResolver) {
  return async ({ req }: { req: { headers: IncomingHttpHeaders } }): Promise<GraphqlContext> => {
    try {
      return { actor: await resolveActor(req.headers) };
    } catch (error) {
      // Apollo reports context failures without a path, which formatError would pass
      // through as a request error; the code marks this one as internal.
      throw new GraphQLError("Internal server error", {
        originalError: error instanceof Error ? error : undefined,
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      });
    }
  };
}
