import { mutationPayload, type Resolvers } from "../../../core/graphql";
import type { DemoUseCases } from "../app";

export function createResolvers(useCases: DemoUseCases): Resolvers {
  return {
    Query: {
      demo: async (_parent, _args, context) =>
        toGraphql(await useCases.getDemoData(context.getActor())),
    },
    Mutation: {
      demo: () => ({}),
    },
    DemoMutations: {
      clear: (_parent, _args, context) =>
        mutationPayload("demoData", async () =>
          toGraphql(await useCases.clearDemoData(context.getActor())),
        ),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
