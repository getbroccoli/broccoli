import type { Resolvers } from "../../../core/graphql";
import type { DemoUseCases } from "../app";

export function createResolvers(useCases: DemoUseCases): Resolvers {
  return {
    Query: {
      demo: async (_parent, _args, { actor }) => toGraphql(await useCases.getDemoData(actor)),
    },
    Mutation: {
      demo: () => ({}),
    },
    DemoMutations: {
      clear: async (_parent, _args, { actor }) => toGraphql(await useCases.clearDemoData(actor)),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
