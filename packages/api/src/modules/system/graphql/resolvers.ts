import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { readInstance, readSetupHolder, type AiConfig } from "../../../core/instance";
import { OPERATIONS, type SecurityContext } from "../../../core/security";
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
const OWNER_SIGN_IN_METHODS = {
  sign_in_with_google: "SIGN_IN_WITH_GOOGLE",
  sign_in_with_email: "SIGN_IN_WITH_EMAIL",
} as const;
const KEY_ORIGINS = { environment: "ENVIRONMENT", saved: "SAVED" } as const;
const AI_SOURCE_INPUTS = {
  BROCCOLI_AI: "broccoli_ai",
  OPENROUTER: "openrouter",
  EXTERNAL_AGENT: "external_agent",
} as const;

export function createResolvers(orm: Orm, mode: Mode, useCases: SystemUseCases): Resolvers {
  const readSetup = (security: SecurityContext | null) => readSetupView(orm, mode, security);
  return {
    Query: {
      ping: () => "pong",
      setup: (_parent, _args, { security }) => readSetup(security),
      me: (_parent, _args, { security }) => {
        const user = security?.user;
        return user
          ? {
              id: user.userId,
              email: user.email,
              isOwner: user.isOwner,
              permissionProfiles: [...user.permissionProfiles],
              operations: OPERATIONS.filter((operation) => security.can(operation)),
            }
          : null;
      },
    },
    Setup: {
      ai: async (_parent, _args, context) => toGraphql(await useCases.ai.read(context.getActor())),
    },
    Mutation: {
      setup: () => ({}),
    },
    SetupMutations: {
      complete: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupCompletePayload"]>(async () => {
          const actor = context.getActor();
          await useCases.completeSetup(actor);
          return { setup: await readSetup(actor) };
        }, ["CONFLICT"]),
      reset: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["SetupResetPayload"]>(async () => {
          const actor = context.getActor();
          await useCases.resetSetup(actor);
          return { setup: await readSetup(actor) };
        }, ["CONFLICT"]),
      saveAiSource: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["SetupSaveAiSourcePayload"]>(async () => {
          const actor = context.getActor();
          await useCases.ai.save(actor, {
            source: AI_SOURCE_INPUTS[input.source],
            openRouterKey: input.openRouterKey,
          });
          return { setup: await readSetup(actor) };
        }, ["INVALID_INPUT", "UNAVAILABLE", "CONFLICT"]),
    },
  };
}

/** The `Setup` object for `security`, as `Query.setup` and every setup payload return it. */
export async function readSetupView(orm: Orm, mode: Mode, security: SecurityContext | null) {
  const { step, demoExpiresAt, ownerSignInMethod } = await readInstance(orm);
  return {
    id: "instance",
    step: STEPS[step],
    mode: MODES[mode],
    // A live setup cookie made the request the setup holder; any other carries no live token.
    holder: security?.isSetupHolder
      ? ("YOU" as const)
      : HOLDERS[await readSetupHolder(orm, { token: null, now: new Date() })],
    // Only the owner learns when their demo ends.
    demoExpiresAt: security?.user?.isOwner ? demoExpiresAt : null,
    ownerSignInMethod: ownerSignInMethod && OWNER_SIGN_IN_METHODS[ownerSignInMethod],
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
