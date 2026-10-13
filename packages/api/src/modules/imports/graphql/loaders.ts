import DataLoader from "dataloader";

import type { GraphqlContext } from "../../../core/graphql";
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
  const perRequest = new WeakMap<GraphqlContext, ImportLoaders>();
  return (context) => {
    let loaders = perRequest.get(context);
    if (!loaders) {
      loaders = createLoaders(useCases, context);
      perRequest.set(context, loaders);
    }
    return loaders;
  };
}

function createLoaders(useCases: ImportUseCases, { actor }: GraphqlContext) {
  return {
    source: new DataLoader<string, ImportSource>(async (ids) => {
      const sources = new Map(
        (await useCases.readSources(actor, ids)).map((source) => [source.id, source]),
      );
      return ids.map((id) => sources.get(id) ?? new Error(`No import source ${id}`));
    }),
    employeeCount: new DataLoader<string, number>(async (sourceIds) => {
      const counts = await useCases.countEmployees(actor, sourceIds);
      return sourceIds.map((id) => counts.get(id)!);
    }),
  };
}
