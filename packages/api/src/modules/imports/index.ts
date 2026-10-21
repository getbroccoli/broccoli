import express from "express";

import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import type { ImportUseCases } from "./app";
import { createResolvers } from "./graphql";
import { filesRouter, photoRouter } from "./http";

export {
  createImportUseCases,
  type ImportUseCases,
  prepareDemoStart,
  READ_PEOPLE_JSON_SCHEMA,
  type ReadPeopleOutcome,
} from "./app";
export {
  type AnsweredMapping,
  type ExternalAgentParseFileWay,
  type MappingAnswersInput,
  type MappingQuestions,
  parseReadPeople,
  parseStaffFileName,
} from "./domain";
/** For test seeding only; other modules go through the use cases. */
export { importPhotoRepository, importReader, lockImport } from "./db";
export type { ImportEmployeeValues } from "./domain";

/**
 * Bringing people in before they become employees: sources such as the Slack
 * workspace and uploaded files deliver records, which wait in the import for review.
 */
export function importsModule(
  /** Built once by `createModules`, which also gives them to the external agent. */
  useCases: ImportUseCases,
): ModuleManifest {
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    router: (resolveSecurity) =>
      express
        .Router()
        .use(filesRouter(useCases, resolveSecurity))
        .use(photoRouter(useCases, resolveSecurity)),
    events: {
      "instance.setup_completed": () => useCases.finishImport(PrincipalSecurityContext.system()),
    },
    jobs: {
      "imports.mapFile": {
        run: (job) => useCases.files.mapFile(PrincipalSecurityContext.system(), job),
        onFailed: (job) => useCases.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
      "imports.readOriginalFile": {
        run: (job) =>
          useCases.originalFileReads.readOriginalFile(PrincipalSecurityContext.system(), job),
        // Both jobs end alike: the file fails, unless a newer run has started.
        onFailed: (job) => useCases.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
    },
  };
}
