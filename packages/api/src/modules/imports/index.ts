import express from "express";

import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import type { ImportUseCases } from "./app";
import { createResolvers } from "./graphql";
import { filesRouter, photoRouter } from "./http";

// Public values.
export { createImportUseCases, READ_PEOPLE_JSON_SCHEMA } from "./app";
export { parseReadPeople, parseStaffFileName } from "./domain";

// Public types.
export type { ImportUseCases, ReadPeopleOutcome } from "./app";
export type {
  AnsweredMapping,
  ExternalAgentParseFileWay,
  MappingAnswersInput,
  MappingQuestions,
} from "./domain";

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
        // A model may take minutes to read a whole file, twice with a new Broccoli AI token.
        expireInSeconds: 15 * 60,
        // Both jobs end alike: the file fails, unless a newer run has started.
        onFailed: (job) => useCases.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
    },
  };
}
