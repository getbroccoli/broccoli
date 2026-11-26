import DataLoader from "dataloader";

import { perRequest, type Resolvers, toEnum } from "../../graphql";
import type { ProcessService } from "../app";

export function createResolvers(processes: ProcessService): Resolvers {
  // The process runs behind a list of tasks, read together.
  const loaders = perRequest((context) => ({
    run: new DataLoader(async (taskIds: readonly string[]) => {
      const runs = await processes.readStepProgress(context.getActor(), taskIds);
      return taskIds.map((id) => runs.get(id) ?? null);
    }),
  }));
  return {
    Task: {
      processRun: ({ id }, _args, context) => loaders(context).run.load(id),
    },
    TaskProcessRun: {
      status: ({ status }) => toEnum(status),
    },
    ProcessRunOutcome: {
      decidedAt: ({ at }) => at,
    },
  };
}
