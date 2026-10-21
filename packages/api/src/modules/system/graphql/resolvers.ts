import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import type { Resolvers } from "../../../core/graphql";
import { readSetup } from "../../../core/instance";
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
    },
  };
}
