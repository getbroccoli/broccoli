import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { ImportReview, ImportUseCases } from "../app";
import type { ImportProgress, ImportSource } from "../domain";

/** One request's loaders for import data. */
export interface ImportLoaders {
  source: DataLoader<string, ImportSource>;
  employeeCount: DataLoader<string, number>;
  /** The import's progress, read once and shared by every field of the request. */
  progress: () => Promise<ImportProgress>;
  /** The import review, read once and shared by every field of the request. */
  review: () => Promise<ImportReview>;
}

/** One request's loaders: related data in one query per list, not one per item. Create once, in `createResolvers`. */
export function importLoaders(
  useCases: ImportUseCases,
): (context: GraphqlContext) => ImportLoaders {
  return perRequest((context) => createLoaders(useCases, context));
}

function createLoaders(useCases: ImportUseCases, context: GraphqlContext): ImportLoaders {
  const ctx = context.getActor();
  let progress: Promise<ImportProgress> | undefined;
  let review: Promise<ImportReview> | undefined;
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
    progress: () => (progress ??= useCases.reads.readProgress(ctx)),
    review: () => (review ??= useCases.reads.readReview(ctx)),
  };
}
