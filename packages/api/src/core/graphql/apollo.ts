import type { Server, ServerResponse } from "node:http";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import express from "express";
import { GraphQLError } from "graphql";

import type { Logger } from "../logger";
import { requireSignedIn, type SecurityContext, type SecurityResolver } from "../security";
import { depthLimit } from "./depthLimit";
import { errorLoggingPlugin } from "./errorLogging";
import { formatError } from "./errors";
import { requireSessionOutsidePublicFields } from "./publicFields";
import type { Resolvers } from "./resolvers.gen";
import { DateScalar, DateTimeScalar } from "./scalars";
import { readSdl } from "./sdl";
import { singleMutationField } from "./singleMutationField";

/** Deepest field nesting a request may use. */
export const MAX_DEPTH = 10;
/** Largest document the parser accepts; also bounds wide queries such as alias floods. */
export const MAX_TOKENS = 2000;

/**
 * What every resolver receives as its context. A class, so `getActor` lives on the
 * prototype: Apollo Server copies the context's own properties for each operation.
 */
export class GraphqlContext {
  constructor(
    /** The signed-in user's security context, or null without a session. */
    readonly security: SecurityContext | null,
    /** The origin browsers reach this instance at, as the request shows it. */
    readonly publicOrigin: () => Promise<string>,
  ) {}

  /**
   * The security context to pass to a use case; throws `UNAUTHENTICATED` without a
   * session. Root fields outside `@public` call it before their resolver runs.
   */
  getActor(): SecurityContext {
    return requireSignedIn(this.security);
  }
}

/** The origin browsers reach this instance at, for the request they sent. */
export type PublicOrigin = (request: express.Request) => Promise<string>;

/** Scalars and types that every module may use. */
const CORE_TYPE_DEFS = readSdl(import.meta.url, "./schema.graphql");
const CORE_RESOLVERS = { Date: DateScalar, DateTime: DateTimeScalar };

export interface GraphqlApi {
  /** Serves `POST /api/graphql`. */
  router: express.Router;
  /** Drains in-flight requests and closes the HTTP server. */
  stop(): Promise<void>;
}

/** Builds the schema from the modules' SDL and resolvers and starts Apollo Server. */
export async function startGraphqlApi(
  manifests: readonly { typeDefs: string; resolvers: Resolvers }[],
  httpServer: Server,
  logger: Logger,
  resolveSecurity: SecurityResolver,
  publicOrigin: PublicOrigin,
): Promise<GraphqlApi> {
  const apollo = new ApolloServer<GraphqlContext>({
    schema: requireSessionOutsidePublicFields(
      makeExecutableSchema({
        typeDefs: [CORE_TYPE_DEFS, ...manifests.map((manifest) => manifest.typeDefs)],
        resolvers: [CORE_RESOLVERS, ...manifests.map((manifest) => manifest.resolvers)],
      }),
    ),
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
        expressMiddleware(apollo, { context: createContext(resolveSecurity, publicOrigin) }),
      ),
    stop: () => apollo.stop(),
  };
}

/** Builds each request's context; a failure becomes a masked internal error. */
export function createContext(resolveSecurity: SecurityResolver, publicOrigin: PublicOrigin) {
  return async ({
    req,
    res,
  }: {
    req: express.Request;
    res: ServerResponse;
  }): Promise<GraphqlContext> => {
    // A bearer token belongs to the external agent, which GraphQL never serves, not even its public fields.
    if (req.headers.authorization !== undefined) {
      throw new GraphQLError("Sign in to continue.", {
        extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
      });
    }
    try {
      const { security, renewedCookies } = await resolveSecurity(req.headers);
      // The security resolver renews sessions; this HTTP boundary forwards their cookies.
      if (renewedCookies.length > 0) {
        res.appendHeader("Set-Cookie", renewedCookies);
      }
      return new GraphqlContext(security, () => publicOrigin(req));
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
