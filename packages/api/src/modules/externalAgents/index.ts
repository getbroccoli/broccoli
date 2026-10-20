import express from "express";

import { readSdl } from "../../core/graphql";
import type { Mode } from "../../core/env";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import type { ImportUseCases } from "../imports";
import { createExternalAgentUseCases } from "./app";
import { createResolvers } from "./graphql";
import { agentFilesRouter, agentRouter } from "./http";

export { createExternalAgentUseCases, type ExternalAgentUseCases } from "./app";

/**
 * The owner's own coding agent, such as Claude Code or Codex, working on setup through a limited
 * session: it connects with a one-time code and maps staff files into the import, never approving.
 */
export function externalAgentsModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
    mode: Mode;
    imports: Pick<ImportUseCases, "answeredMapping" | "parsedSources">;
  },
): ModuleManifest {
  const useCases = createExternalAgentUseCases(dependencies);
  return {
    name: "externalAgents",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(dependencies.orm, dependencies.mode, useCases),
    router: (resolveSecurity) =>
      express
        .Router()
        .use(agentRouter(useCases, dependencies.logger))
        .use(agentFilesRouter(useCases, resolveSecurity)),
  };
}
