import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { ImportUseCases } from "../app";
import type { ImportSource } from "../domain";

export type ImportLoaders = ReturnType<typeof createLoaders>;

/**
 * The loaders of one request, so a list of records or sources loads their related
 * data in one query each instead of one per item.
 */
export function importLoaders(
  useCases: ImportUseCases,
): (context: GraphqlContext) => ImportLoaders {
  return perRequest((context) => createLoaders(useCases, context));
}

function createLoaders(useCases: ImportUseCases, context: GraphqlContext) {
  const ctx = context.getActor();
  return {
    source: new DataLoader<string, ImportSource>(async (ids) => {
      const sources = new Map(
        (await useCases.readSources(ctx, ids)).map((source) => [source.id, source]),
      );
      return ids.map((id) => sources.get(id) ?? new Error(`No import source ${id}`));
    }),
    employeeCount: new DataLoader<string, number>(async (sourceIds) => {
      const counts = await useCases.countEmployees(ctx, sourceIds);
      return sourceIds.map((id) => counts.get(id)!);
    }),
  };
}
