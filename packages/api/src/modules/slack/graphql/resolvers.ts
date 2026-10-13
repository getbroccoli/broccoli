import type { Resolvers } from "../../../core/graphql";
import type { SlackUseCases } from "../app";

export function createResolvers(useCases: SlackUseCases): Resolvers {
  return {
    Query: {
      slackConnection: async (_parent, _args, { actor }) => {
        const connection = await useCases.getSlackConnection(actor);
        return connection && { id: "slack", workspaceName: connection.teamName };
      },
    },
  };
}
