import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/module-manifest";
import { createResolvers } from "./graphql/resolvers";

/** Platform-level API fields that belong to no business module. */
export function systemModule({ orm }: Pick<ModuleDependencies, "orm">): ModuleManifest {
  return {
    name: "system",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(orm),
  };
}
