import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readSetupView } from "../../system";
import type { ExternalAgentUseCases } from "../app";
import type { AgentWay } from "../domain";

const WAYS = {
  answers_masked_questions: "ANSWERS_MASKED_QUESTIONS",
  parses_original_files: "PARSES_ORIGINAL_FILES",
} as const;
const WAY_INPUTS = {
  ANSWERS_MASKED_QUESTIONS: "answers_masked_questions",
  PARSES_ORIGINAL_FILES: "parses_original_files",
} as const satisfies Record<string, AgentWay>;

export function createResolvers(orm: Orm, mode: Mode, useCases: ExternalAgentUseCases): Resolvers {
  return {
    Ai: {
      agent: async (_parent, _args, context) => {
        const connection = await useCases.sessions.readAgentConnection(context.getActor());
        return connection && { id: "agent", ...connection, way: WAYS[connection.way] };
      },
      agentCode: async (_parent, _args, context) => {
        const code = await useCases.sessions.readPendingAgentCode(context.getActor());
        return code && { ...code, way: WAYS[code.way] };
      },
    },
    SetupMutations: {
      chooseAgent: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupChooseAgentPayload"]>(
          "setup",
          async () => {
            const actor = context.getActor();
            await useCases.sessions.chooseAgent(actor);
            return readSetupView(orm, mode, actor);
          },
          ["CONFLICT"],
        ),
      createAgentCode: (_parent, { way }, context) =>
        mutationPayload<ResolversTypes["SetupCreateAgentCodePayload"]>(
          "agentCode",
          async () => {
            const code = await useCases.sessions.createAgentCode(context.getActor(), {
              way: WAY_INPUTS[way],
              origin: context.origin,
            });
            return { ...code, way: WAYS[code.way] };
          },
          ["CONFLICT"],
        ),
      disconnectAgent: async (_parent, _args, context) => {
        const actor = context.getActor();
        await useCases.sessions.disconnectAgent(actor);
        return { setup: await readSetupView(orm, mode, actor) };
      },
    },
  };
}
