import type { Resolvers } from "../../../core/graphql";
import type { DemoUseCases } from "../app";

export function createResolvers(useCases: DemoUseCases): Resolvers {
  return {
    Query: {
      demo: async (_parent, _args, context) =>
        toGraphql(await useCases.getDemoData(context.requireSignedIn())),
    },
    Mutation: {
      demo: () => ({}),
    },
    DemoMutations: {
      clear: async (_parent, _args, context) =>
        toGraphql(await useCases.clearDemoData(context.requireSignedIn())),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
