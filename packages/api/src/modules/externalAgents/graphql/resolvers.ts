import type { Orm } from "../../../core/db";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readSetup } from "../../../core/instance";
import type { ExternalAgentUseCases } from "../app";

export function createResolvers(orm: Orm, useCases: ExternalAgentUseCases): Resolvers {
  return {
    Ai: {
      externalAgent: async (_parent, _args, context) => {
        const connection = await useCases.sessions.readExternalAgentConnection(context.getActor());
        return connection && { id: "external-agent", ...connection };
      },
    },
    SetupMutations: {
      chooseExternalAgent: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupChooseExternalAgentPayload"]>(
          "setup",
          async () => {
            const actor = context.getActor();
            await useCases.sessions.chooseExternalAgent(actor);
            return readSetup(orm, actor);
          },
          ["CONFLICT"],
        ),
      createExternalAgentCode: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupCreateExternalAgentCodePayload"]>(
          "externalAgentCode",
          () => useCases.sessions.createExternalAgentCode(context.getActor()),
          ["CONFLICT"],
        ),
      disconnectExternalAgent: async (_parent, _args, context) => {
        const actor = context.getActor();
        await useCases.sessions.disconnectExternalAgent(actor);
        return { setup: await readSetup(orm, actor) };
      },
    },
  };
}
