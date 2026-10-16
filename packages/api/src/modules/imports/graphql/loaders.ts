import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { ImportUseCases } from "../app";
import type { ImportSource } from "../domain";

/** One request's loaders for import data. */
export interface ImportLoaders {
  source: DataLoader<string, ImportSource>;
  employeeCount: DataLoader<string, number>;
}

/** One request's loaders: related data in one query per list, not one per item. Create once, in `createResolvers`. */
export function importLoaders(
  useCases: ImportUseCases,
): (context: GraphqlContext) => ImportLoaders {
  return perRequest((context) => createLoaders(useCases, context));
}

function createLoaders(useCases: ImportUseCases, context: GraphqlContext): ImportLoaders {
  const ctx = context.getActor();
  return {
    source: new DataLoader<string, ImportSource>(async (ids) => {
      const sources = new Map(
        (await useCases.reads.readSources(ctx, ids)).map((source) => [source.id, source]),
      );
      return ids.map((id) => sources.get(id) ?? new Error(`No import source ${id}`));
    }),
    employeeCount: new DataLoader<string, number>(async (sourceIds) => {
      const counts = await useCases.reads.countEmployees(ctx, sourceIds);
      return sourceIds.map((id) => counts.get(id)!);
    }),
  };
}
