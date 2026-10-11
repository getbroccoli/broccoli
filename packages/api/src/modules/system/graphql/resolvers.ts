import type { Orm } from "../../../core/db";
import type { Resolvers } from "../../../core/graphql";
import { readSetupStep } from "../../../core/instance";

const STEPS = { owner: "OWNER", company: "COMPANY", done: "DONE" } as const;

export function createResolvers(orm: Orm): Resolvers {
  return {
    Query: {
      ping: () => "pong",
      setup: async () => ({ id: "instance", step: STEPS[await readSetupStep(orm)] }),
    },
  };
}
