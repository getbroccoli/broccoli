import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { DemoService } from "../app";

export function createResolvers(demo: DemoService): Resolvers {
  return {
    Query: {
      demo: async (_parent, _args, context) =>
        toGraphql(await demo.getDemoData(context.getActor())),
    },
    Mutation: {
      demo: () => ({}),
    },
    DemoMutations: {
      exit: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["DemoExitPayload"]>(
          async () => ({ demoData: toGraphql(await demo.exitDemo(context.getActor())) }),
          ["CONFLICT"],
        ),
    },
  };
}

function toGraphql({ isPresent }: { isPresent: boolean }) {
  return { id: "demoData", isPresent };
}
