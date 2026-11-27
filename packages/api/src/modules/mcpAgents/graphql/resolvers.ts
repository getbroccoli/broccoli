import type {
  AgentActivityService,
  AgentConnectionService,
  StoredEndedAgentConnection,
} from "../../../core/agentAccess";
import {
  mutationPayload,
  toEnum,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";

export function createResolvers(
  connections: AgentConnectionService,
  activity: AgentActivityService,
): Resolvers {
  return {
    Query: {
      myAgentActivity: async (_parent, args, context) => {
        const page = await activity.listMyActivity(context.getActor(), args);
        return {
          ...page,
          edges: page.edges.map(({ cursor, node }) => ({
            cursor,
            node: { ...node, outcome: toEnum(node.outcome) },
          })),
        };
      },
      myAgentConnection: (_parent, _args, context) =>
        connections.readMyAgentConnection(context.getActor()),
      myLastEndedAgentConnection: async (_parent, _args, context) =>
        toGraphql(await connections.readMyLastEndedConnection(context.getActor())),
    },
    Mutation: {
      mcpAgents: () => ({}),
    },
    McpAgentsMutations: {
      disconnect: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["AgentConnectionMutationPayload"]>(async () => ({
          endedAgentConnection: toGraphql(await connections.disconnectMyAgent(context.getActor())),
        })),
    },
  };
}

function toGraphql(ended: StoredEndedAgentConnection | null) {
  return ended && { ...ended, reason: toEnum(ended.reason) };
}
