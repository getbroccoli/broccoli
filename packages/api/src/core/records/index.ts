import type { Orm } from "../db";
import { readSdl, type Resolvers } from "../graphql";
import { createRecordHistoryReader, type RecordTypeRegistry } from "./app";
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
export type {
  LoadedRecord,
  RecordChanged,
  RecordTypeRegistration,
  RecordTypeRegistry,
  VisibleFieldChange,
  VisibleHistoryLine,
} from "./app";
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
 * for each record type the modules register.
 */
export function recordsManifest(
  orm: Orm,
  modules: readonly { recordTypes?: RecordTypeRegistry }[],
): { name: string; typeDefs: string; resolvers: Resolvers } {
  const registry: RecordTypeRegistry = {};
  for (const { recordTypes } of modules) {
    Object.assign(registry, recordTypes);
  }
  return {
    name: "records",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(orm, registry, createRecordHistoryReader(orm, registry)),
  };
}
