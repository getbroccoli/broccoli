import type { AgentConnectionService } from "../../../core/agentAccess";
import type { Resolvers } from "../../../core/graphql";

export function createResolvers(
  connections: Pick<AgentConnectionService, "readMyAgentConnection">,
): Resolvers {
  return {
    Query: {
      myAgentConnection: (_parent, _args, context) =>
        connections.readMyAgentConnection(context.getActor()),
    },
  };
}
