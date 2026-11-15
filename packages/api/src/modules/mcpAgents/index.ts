import {
  createAgentActivityService,
  createAgentConnectionService,
  deleteOldAgentActivityJob,
} from "../../core/agentAccess";
import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createMcpAgentToolService } from "./app";
import { createResolvers } from "./graphql";
import { mcpAgentRouter } from "./mcp";

// Public values.
export { createMcpAgentToolService } from "./app";

/**
 * A person's own agent, such as Claude, ChatGPT, Claude Code or Codex, connected over MCP: it
 * acts as that person, with their permissions, through the tools offered here.
 */
export function mcpAgentsModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger">,
): ModuleManifest {
  const { logger } = dependencies;
  const tools = createMcpAgentToolService(dependencies);
  const activity = createAgentActivityService(dependencies);
  return {
    name: "mcpAgents",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(createAgentConnectionService(dependencies), activity),
    router: (_resolveSecurity, publicOrigin, resolveAgentSecurity) =>
      mcpAgentRouter(publicOrigin, resolveAgentSecurity, { tools, activity, logger }),
    jobs: deleteOldAgentActivityJob({ activity, logger }),
  };
}
