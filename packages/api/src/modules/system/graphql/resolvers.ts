import type { Orm } from "../../../core/db";
import type { Mode } from "../../../core/env";
import type { Resolvers } from "../../../core/graphql";
import { readSetupHolder, readSetupStep } from "../../../core/instance";

const STEPS = { company: "COMPANY", import: "IMPORT", owner: "OWNER", done: "DONE" } as const;
const HOLDERS = { you: "YOU", another_device: "ANOTHER_DEVICE", nobody: "NOBODY" } as const;
const MODES = { self_hosted: "SELF_HOSTED", managed: "MANAGED" } as const;

export function createResolvers(orm: Orm, mode: Mode): Resolvers {
  return {
    Query: {
      ping: () => "pong",
      setup: async (_parent, _args, { security }) => ({
        id: "instance",
        step: STEPS[await readSetupStep(orm)],
        mode: MODES[mode],
        // A live setup cookie made the request the setup holder; any other carries no live token.
        holder: security?.isSetupHolder
          ? "YOU"
          : HOLDERS[await readSetupHolder(orm, { token: null, now: new Date() })],
      }),
      me: (_parent, _args, { security }) => {
        const user = security?.user;
        return user ? { id: user.userId, email: user.email, isOwner: user.isOwner } : null;
      },
    },
  };
}
