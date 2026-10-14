import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createImportUseCases, type SlackReader } from "./app";
import { createResolvers } from "./graphql";

export { createImportUseCases, type ImportUseCases } from "./app";
/** For test seeding only; other modules go through the use cases. */
export { importRepository } from "./db";
export type { ImportEmployeeValues } from "./domain";

/**
 * Bringing people in before they become employees: sources such as the Slack
 * workspace deliver records, which wait in the import for review.
 */
export function importsModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact"> & { slack: SlackReader },
): ModuleManifest {
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(createImportUseCases(dependencies)),
  };
}
