import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import type { Resolvers } from "../../../core/graphql";
import { readSetupStep } from "../../../core/instance";

const STEPS = { owner: "OWNER", company: "COMPANY", done: "DONE" } as const;
const SIGN_IN = { self_hosted: "PASSWORD", managed: "MANAGED" } as const;

export function createResolvers(orm: Orm, mode: Mode): Resolvers {
  return {
    Query: {
      ping: () => "pong",
      setup: async () => ({
        id: "instance",
        step: STEPS[await readSetupStep(orm)],
        signIn: SIGN_IN[mode],
      }),
      me: (_parent, _args, { security }) => {
        const user = security?.user;
        return user ? { id: user.userId, email: user.email, isOwner: user.isOwner } : null;
      },
    },
  };
}
