import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { createSystemUseCases, type SystemContext } from "./app";
import { createResolvers } from "./graphql";

export { createSystemUseCases } from "./app";

/** Platform-level API fields that belong to no business module: setup and the user. */
export function systemModule(context: SystemContext): ModuleManifest {
  return {
    name: "system",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(context.orm, context.mode, createSystemUseCases(context)),
  };
}
