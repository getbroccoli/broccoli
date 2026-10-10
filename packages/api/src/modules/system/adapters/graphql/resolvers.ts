import type { Resolvers } from "../../../../core/graphql";

export const resolvers: Resolvers = {
  Query: {
    ping: () => "pong",
  },
};
