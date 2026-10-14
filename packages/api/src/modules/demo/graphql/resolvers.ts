import type { Resolvers } from "../../../core/graphql";
import type { DemoUseCases } from "../app";

export function createResolvers(useCases: DemoUseCases): Resolvers {
  return {
    Query: {
      demo: async (_parent, _args, { security }) => toGraphql(await useCases.getDemoData(security)),
    },
    Mutation: {
      demo: () => ({}),
    },
    DemoMutations: {
      clear: async (_parent, _args, { security }) =>
        toGraphql(await useCases.clearDemoData(security)),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
