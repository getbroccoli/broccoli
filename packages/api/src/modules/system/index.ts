import { readFileSync } from "node:fs";

import type { ModuleManifest } from "../../core/module-manifest";
import { resolvers } from "./adapters/graphql/resolvers";

/** Platform-level API fields that belong to no business module. */
export const system: ModuleManifest = {
  name: "system",
  typeDefs: readFileSync(new URL("./adapters/graphql/schema.graphql", import.meta.url), "utf8"),
  resolvers,
};
