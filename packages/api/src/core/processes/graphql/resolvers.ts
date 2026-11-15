import DataLoader from "dataloader";

import { perRequest, type Resolvers } from "../../graphql";
import type { ProcessService } from "../app";

export function createResolvers(processes: ProcessService): Resolvers {
  // The process steps behind a list of tasks, read in one query.
  const loaders = perRequest(() => ({
    source: new DataLoader(async (taskIds: readonly string[]) => {
      const sources = await processes.readTaskSources(taskIds);
      return taskIds.map((id) => sources.get(id) ?? null);
    }),
  }));
  return {
    Task: {
      processSource: ({ id }, _args, context) => loaders(context).source.load(id),
    },
  };
}
