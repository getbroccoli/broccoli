import type { Orm } from "../../../core/db";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readSetup } from "../../../core/instance";
import type { AiSettings } from "../app";
import type { AiConfig } from "../domain";

const AI_SOURCES = {
  broccoli_ai: "BROCCOLI_AI",
  openrouter: "OPENROUTER",
  external_agent: "EXTERNAL_AGENT",
} as const;
const KEY_ORIGINS = { environment: "ENVIRONMENT", saved: "SAVED" } as const;
const MODEL_SOURCES = { BROCCOLI_AI: "broccoli_ai", OPENROUTER: "openrouter" } as const;

export function createResolvers(orm: Orm, aiSettings: AiSettings): Resolvers {
  return {
    Setup: {
      ai: async (_parent, _args, context) => toGraphql(await aiSettings.read(context.getActor())),
    },
    SetupMutations: {
      saveAiSource: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["SetupSaveAiSourcePayload"]>(
          "setup",
          async () => {
            const actor = context.getActor();
            await aiSettings.save(actor, {
              source: MODEL_SOURCES[input.source],
              openRouterKey: input.openRouterKey,
            });
            return readSetup(orm, actor);
          },
          ["INVALID_INPUT", "UNAVAILABLE", "CONFLICT"],
        ),
    },
  };
}

function toGraphql(ai: AiConfig | null) {
  return (
    ai && {
      id: "ai",
      source: AI_SOURCES[ai.source],
      openRouterKey: ai.openRouterKey && KEY_ORIGINS[ai.openRouterKey.origin],
    }
  );
}
