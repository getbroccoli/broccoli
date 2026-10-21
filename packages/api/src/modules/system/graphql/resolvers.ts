import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readSetup, type AiConfig } from "../../../core/instance";
import type { SystemUseCases } from "../app";

const STEPS = {
  company: "COMPANY",
  import: "IMPORT",
  owner: "OWNER",
  ready: "READY",
  done: "DONE",
} as const;
const HOLDERS = { you: "YOU", another_device: "ANOTHER_DEVICE", nobody: "NOBODY" } as const;
const MODES = { self_hosted: "SELF_HOSTED", managed: "MANAGED" } as const;
const AI_SOURCES = {
  broccoli_ai: "BROCCOLI_AI",
  openrouter: "OPENROUTER",
  external_agent: "EXTERNAL_AGENT",
} as const;
const KEY_ORIGINS = { environment: "ENVIRONMENT", saved: "SAVED" } as const;
const AI_SOURCE_INPUTS = {
  BROCCOLI_AI: "broccoli_ai",
  OPENROUTER: "openrouter",
  EXTERNAL_AGENT: "external_agent",
} as const;

export function createResolvers(orm: Orm, mode: Mode, useCases: SystemUseCases): Resolvers {
  return {
    Query: {
      ping: () => "pong",
      setup: (_parent, _args, { security }) => readSetup(orm, security),
      me: (_parent, _args, { security }) => {
        const user = security?.user;
        return user ? { id: user.userId, email: user.email, isOwner: user.isOwner } : null;
      },
    },
    Setup: {
      id: () => "instance",
      step: ({ step }) => STEPS[step],
      mode: () => MODES[mode],
      holder: ({ holder }) => HOLDERS[holder],
      ai: async (_parent, _args, context) => toGraphql(await useCases.ai.read(context.getActor())),
    },
    Mutation: {
      setup: () => ({}),
    },
    SetupMutations: {
      complete: async (_parent, _args, context) => {
        const actor = context.getActor();
        await useCases.completeSetup(actor);
        return { setup: await readSetup(orm, actor) };
      },
      saveAiSource: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["SetupSaveAiSourcePayload"]>(
          "setup",
          async () => {
            const actor = context.getActor();
            await useCases.ai.save(actor, {
              source: AI_SOURCE_INPUTS[input.source],
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
