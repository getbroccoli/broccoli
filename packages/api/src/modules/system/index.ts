import type { Mode } from "../../core/env";
import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createResolvers } from "./graphql";

/** Platform-level API fields that belong to no business module. */
export function systemModule({
  orm,
  mode,
}: Pick<ModuleDependencies, "orm"> & { mode: Mode }): ModuleManifest {
  return {
    name: "system",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(orm, mode),
  };
}
