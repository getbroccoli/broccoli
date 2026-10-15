import type { Resolvers } from "../../../core/graphql";
import type { SlackConnectionService } from "../app";

export function createResolvers(slackConnection: SlackConnectionService): Resolvers {
  return {
    Query: {
      slackConnection: async (_parent, _args, context) => {
        const connection = await slackConnection.getSlackConnection(context.getActor());
        return connection && { id: "slack", workspaceName: connection.teamName };
      },
    },
  };
}
