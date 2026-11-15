import { z } from "zod";

import type { ProcessActionRegistrations } from "../../src/core/processes";

/** Actions registered only by process tests. */
declare module "../../src/core/processes" {
  interface ProcessActions {
    "test.record_call": { note: string };
    "test.fail": Record<string, never>;
  }
}

export function testActions(): {
  actions: ProcessActionRegistrations;
  calls: { runId: string; stepKey: string; note: string }[];
} {
  const calls: { runId: string; stepKey: string; note: string }[] = [];
  return {
    actions: {
      "test.record_call": {
        params: z.object({ note: z.string() }),
        run: (_ctx, _tx, { run, step, params }) => {
          calls.push({ runId: run.id, stepKey: step.key, note: params.note });
          return Promise.resolve();
        },
      },
      "test.fail": {
        params: z.object({}),
        run: () => {
          throw new Error("Action failed");
        },
      },
    },
    calls,
  };
}
