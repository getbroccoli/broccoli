import type { Resolvers } from "./graphql";

/**
 * Everything a module contributes to the API. The core iterates over the list of
 * manifests, so adding a module never means editing core code.
 */
export interface ModuleManifest {
  name: string;
  /** The module's GraphQL SDL. */
  typeDefs: string;
  resolvers: Resolvers;
}
