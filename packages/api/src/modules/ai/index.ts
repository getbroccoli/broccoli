import type { Orm } from "../../core/db";
import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import type { AiSettings } from "./app";
import { createResolvers } from "./graphql";

export { createAiSettings, type AiSettings } from "./app";

/** How the instance reads files with AI: the owner's choice of model, and the decisions it routes. */
export function aiModule({
  orm,
  aiSettings,
}: {
  orm: Orm;
  aiSettings: AiSettings;
}): ModuleManifest {
  return {
    name: "ai",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(orm, aiSettings),
  };
}
