import type { Orm } from "../db";
import { readSdl, type Resolvers } from "../graphql";
import { createRecordHistoryReader, type RecordHistoryAccess } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export {
  appendRecordHistory,
  createRecordHistoryReader,
  purgeRecordHistory,
  readRecordHistory,
} from "./app";
export { changeReasonSchema, parseChangeReason } from "./domain";

// Public types.
export type { RecordChanged, RecordHistoryAccess } from "./app";
export type {
  CauseKinds,
  FieldChange,
  HistoryAppend,
  HistoryAuthor,
  HistoryLine,
  RecordOperation,
  RecordType,
  RecordTypes,
} from "./domain";

/**
 * The shared record capabilities in the API: the history types and the `recordHistory` query,
 * readable for each record type as the modules' `recordHistoryAccess` allows.
 */
export function recordsManifest(
  orm: Orm,
  modules: readonly { recordHistoryAccess?: RecordHistoryAccess }[],
): { name: string; typeDefs: string; resolvers: Resolvers } {
  const access: RecordHistoryAccess = {};
  for (const { recordHistoryAccess } of modules) {
    Object.assign(access, recordHistoryAccess);
  }
  return {
    name: "records",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(orm, createRecordHistoryReader(orm, access)),
  };
}
