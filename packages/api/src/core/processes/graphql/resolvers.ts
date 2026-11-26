import DataLoader from "dataloader";

import { perRequest, type Resolvers, toEnum } from "../../graphql";
import type { ProcessService } from "../app";

export function createResolvers(processes: ProcessService): Resolvers {
  // The process steps behind a list of tasks, read in one query.
  const loaders = perRequest((context) => ({
    source: new DataLoader(async (taskIds: readonly string[]) => {
      const sources = await processes.readTaskSources(taskIds);
      return taskIds.map((id) => sources.get(id) ?? null);
    }),
    run: new DataLoader(async (taskIds: readonly string[]) => {
      const runs = await processes.readStepProgress(context.getActor(), taskIds);
      return taskIds.map((id) => runs.get(id) ?? null);
    }),
  }));
  return {
    Task: {
      processSource: ({ id }, _args, context) => loaders(context).source.load(id),
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
