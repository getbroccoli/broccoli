import express from "express";

import type { Decisions, ReferenceCompletions } from "../../integrations/ai";
import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import { createImportUseCases, type DemoFill, prepareDemoStart, type SlackReader } from "./app";
import { createResolvers } from "./graphql";
import { filesRouter, photoRouter } from "./http";

export { createImportUseCases, type ImportUseCases } from "./app";
/** For test seeding only; other modules go through the use cases. */
export { importPhotoRepository, importRepository } from "./db";
export type { ImportEmployeeValues } from "./domain";
export { PDF_COMPLETION_TASKS } from "./pdfExtraction";

/**
 * Bringing people in before they become employees: sources such as the Slack
 * workspace and uploaded files deliver records, which wait in the import for review.
 */
export function importsModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger" | "jobs"> & {
    slack: SlackReader;
    /** The model that maps spreadsheets. */
    decisions: Decisions;
    /** The model that reads PDFs, through masked evidence only. */
    completions: ReferenceCompletions;
    /** The demo company that skipping the import fills in. */
    prepareDemoFill: () => Promise<DemoFill>;
  },
): ModuleManifest {
  const useCases = createImportUseCases(dependencies);
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    router: (resolveSecurity) =>
      express
        .Router()
        .use(filesRouter(useCases, resolveSecurity))
        .use(photoRouter(useCases, resolveSecurity, dependencies.orm)),
    prepareDemoStart: () => prepareDemoStart(dependencies),
    events: {
      "instance.setup_completed": () => useCases.finishImport(PrincipalSecurityContext.system()),
    },
    jobs: {
      "imports.mapFile": {
        // A PDF's run may take five minutes, reading and the model included.
        expireInSeconds: 360,
        run: (job) => useCases.files.mapFile(PrincipalSecurityContext.system(), job),
        onFailed: (job) => useCases.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
    },
  };
}
