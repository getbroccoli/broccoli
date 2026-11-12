import type { AgentConnectionService, StoredEndedAgentConnection } from "../../../core/agentAccess";
import {
  mutationPayload,
  toEnum,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";

export function createResolvers(connections: AgentConnectionService): Resolvers {
  return {
    Query: {
      myAgentConnection: (_parent, _args, context) =>
        connections.readMyAgentConnection(context.getActor()),
      myLastEndedAgentConnection: async (_parent, _args, context) =>
        toGraphql(await connections.readMyLastEndedConnection(context.getActor())),
      agentInvitationClosed: (_parent, _args, context) =>
        connections.isInvitationClosed(context.getActor()),
    },
    Mutation: {
      mcpAgents: () => ({}),
    },
    McpAgentsMutations: {
      disconnect: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["AgentConnectionMutationPayload"]>(async () => ({
          endedAgentConnection: toGraphql(await connections.disconnectMyAgent(context.getActor())),
        })),
      closeInvitation: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["CloseAgentInvitationPayload"]>(async () => {
          await connections.closeInvitation(context.getActor());
          return { agentInvitationClosed: true };
        }),
    },
  };
}

function toGraphql(ended: StoredEndedAgentConnection | null) {
  return ended && { ...ended, reason: toEnum(ended.reason) };
}
