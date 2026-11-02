import express from "express";

import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import type { ImportServices } from "./app";
import { createResolvers } from "./graphql";
import { filesRouter, photoRouter } from "./http";

// Public values.
export { createImportServices, READ_PEOPLE_JSON_SCHEMA } from "./app";
export { EXTERNAL_AGENT_FILE_PROGRESS, parseReadPeople, parseStaffFileName } from "./domain";

// Public types.
export type { ImportServices, ReadPeopleOutcome } from "./app";
export type {
  AnsweredMapping,
  ExternalAgentParseFileWay,
  ExternalAgentFileProgress,
  MappingAnswersInput,
  MappingQuestions,
} from "./domain";

/**
 * Bringing people in before they become employees: sources such as the Slack
 * workspace and uploaded files deliver records, which wait in the import for review.
 */
export function importsModule(
  /** Built once by `createModules`, which also gives them to the external agent. */
  services: ImportServices,
): ModuleManifest {
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services),
    router: (resolveSecurity) =>
      express
        .Router()
        .use(filesRouter(services, resolveSecurity))
        .use(photoRouter(services, resolveSecurity)),
    events: {
      "instance.setup_completed": () => services.finishImport(PrincipalSecurityContext.system()),
      "imports.people_added": (added) => Promise.resolve(services.reportAddedPeople(added)),
    },
    jobs: {
      "imports.mapFile": {
        run: (job) => services.files.mapFile(PrincipalSecurityContext.system(), job),
        onFailed: (job) => services.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
      "imports.readOriginalFile": {
        run: (job) =>
          services.originalFileReads.readOriginalFile(PrincipalSecurityContext.system(), job),
        // A model may take minutes to read a whole file, twice with a new Broccoli AI token.
        expireInSeconds: 15 * 60,
        // Both jobs end alike: the file fails, unless a newer run has started.
        onFailed: (job) => services.files.markFileFailed(PrincipalSecurityContext.system(), job),
      },
    },
  };
}
