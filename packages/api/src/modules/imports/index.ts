import type { Decisions } from "../../integrations/ai";
import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import { createImportUseCases, type DemoFill, prepareDemoStart, type SlackReader } from "./app";
import { createResolvers } from "./graphql";
import { filesRouter } from "./http";

export { createImportUseCases, type ImportUseCases } from "./app";
/** For test seeding only; other modules go through the use cases. */
export { importRepository } from "./db";
export type { ImportEmployeeValues } from "./domain";

/**
 * Bringing people in before they become employees: sources such as the Slack
 * workspace and uploaded files deliver records, which wait in the import for review.
 */
export function importsModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger" | "jobs"> & {
    slack: SlackReader;
    /** The model that maps files. */
    decisions: Decisions;
    /** The demo company that skipping the import fills in. */
    prepareDemoFill: () => Promise<DemoFill>;
  },
): ModuleManifest {
  const useCases = createImportUseCases(dependencies);
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    router: (resolveSecurity) => filesRouter(useCases, resolveSecurity),
    prepareDemoStart: () => prepareDemoStart(dependencies),
    jobs: {
      "imports.mapFile": {
        run: (job) => useCases.files.mapFile(PrincipalSecurityContext.system(), job),
        onFailed: (job) => useCases.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
    },
  };
}
