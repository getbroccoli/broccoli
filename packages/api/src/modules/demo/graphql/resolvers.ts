import type { Resolvers } from "../../../core/graphql";
import { requireSignedIn } from "../../../core/security";
import type { DemoUseCases } from "../app";

export function createResolvers(useCases: DemoUseCases): Resolvers {
  return {
    Query: {
      demo: async (_parent, _args, { security }) =>
        toGraphql(await useCases.getDemoData(requireSignedIn(security))),
    },
    Mutation: {
      demo: () => ({}),
    },
    DemoMutations: {
      clear: async (_parent, _args, { security }) =>
        toGraphql(await useCases.clearDemoData(requireSignedIn(security))),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
