import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readSetupView } from "../../system";
import type { ExternalAgentUseCases } from "../app";

export function createResolvers(orm: Orm, mode: Mode, useCases: ExternalAgentUseCases): Resolvers {
  return {
    Ai: {
      externalAgent: async (_parent, _args, context) => {
        const connection = await useCases.sessions.readExternalAgentConnection(context.getActor());
        return connection && { id: "external-agent", ...connection };
      },
    },
    Mutation: {
      chooseExternalAgent: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupChooseExternalAgentPayload"]>(
          "setup",
          async () => {
            const actor = context.getActor();
            await useCases.sessions.chooseExternalAgent(actor);
            return readSetupView(orm, mode, actor);
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
        return { setup: await readSetupView(orm, mode, actor) };
      },
    },
  };
}
