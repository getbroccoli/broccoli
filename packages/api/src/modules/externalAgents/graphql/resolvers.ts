import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readSetupView } from "../../system";
import type { ExternalAgentServices } from "../app";

export function createResolvers(orm: Orm, mode: Mode, services: ExternalAgentServices): Resolvers {
  return {
    Ai: {
      externalAgent: async (_parent, _args, context) => {
        const connection = await services.sessions.readExternalAgentConnection(context.getActor());
        return connection && { id: "external-agent", ...connection };
      },
    },
    Mutation: {
      externalAgents: () => ({}),
    },
    ExternalAgentsMutations: {
      choose: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupChooseExternalAgentPayload"]>(async () => {
          const actor = context.getActor();
          await services.sessions.chooseExternalAgent(actor);
          return { setup: await readSetupView(orm, mode, actor) };
        }, ["CONFLICT"]),
      createCode: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupCreateExternalAgentCodePayload"]>(
          async () => ({
            externalAgentCode: await services.sessions.createExternalAgentCode(context.getActor()),
          }),
          ["CONFLICT"],
        ),
      disconnect: async (_parent, _args, context) => {
        const actor = context.getActor();
        await services.sessions.disconnectExternalAgent(actor);
        return { setup: await readSetupView(orm, mode, actor) };
      },
    },
  };
}
