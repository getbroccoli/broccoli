import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
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
      exit: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["DemoMutationPayload"]>("demoData", async () =>
          toGraphql(await useCases.exitDemo(context.getActor())),
        ),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
