import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/module-manifest";
import { resolvers } from "./graphql/resolvers";

/** Platform-level API fields that belong to no business module. */
export const system: ModuleManifest = {
  name: "system",
  typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
  resolvers,
};
