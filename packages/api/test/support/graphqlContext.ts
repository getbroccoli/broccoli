import { GraphqlContext } from "../../src/core/graphql";
import type { SecurityContext } from "../../src/core/security";

/** A request's GraphQL context for `security`, reached at `http://localhost`. */
export function createGraphqlContext(security: SecurityContext | null): GraphqlContext {
  return new GraphqlContext(security, () => Promise.resolve("http://localhost"));
}
