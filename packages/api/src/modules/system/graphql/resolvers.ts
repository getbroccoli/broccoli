import { readUserEmail } from "../../../core/auth";
import type { Orm } from "../../../core/db";
import type { Resolvers } from "../../../core/graphql";
import { readSetupStep } from "../../../core/instance";

const STEPS = { owner: "OWNER", company: "COMPANY", done: "DONE" } as const;

export function createResolvers(orm: Orm): Resolvers {
  return {
    Query: {
      ping: () => "pong",
      setup: async () => ({ id: "instance", step: STEPS[await readSetupStep(orm)] }),
      me: async (_parent, _args, { actor }) =>
        actor && {
          id: actor.userId,
          email: await readUserEmail(orm, actor.userId),
          isOwner: actor.isOwner,
        },
    },
  };
}
