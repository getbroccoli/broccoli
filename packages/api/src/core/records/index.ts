import type { Orm, Transact } from "../db";
import type { Logger } from "../logger";
import { readSdl, type Resolvers } from "../graphql";
import {
  createRecordCloneService,
  createRecordHistoryReaderService,
  type RecordTypeRegistry,
} from "./app";
import { createResolvers } from "./graphql";

// Public values.
export {
  createRecordCloneService,
  createRecordHistoryReaderService,
  createRecordHistoryService,
} from "./app";
export { changeReasonSchema, parseChangeReason } from "./domain";

// Public types.
export type {
  LoadedRecord,
  RecordChanged,
  RecordTypeRegistration,
  RecordTypeRegistry,
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
 * The shared record capabilities in the API: the history types, the `recordHistory` query and
 * cloning, for each record type the modules register.
 */
export function recordsManifest(
  { orm, transact, logger }: { orm: Orm; transact: Transact; logger: Logger },
  modules: readonly { recordTypes?: RecordTypeRegistry }[],
): { name: string; typeDefs: string; resolvers: Resolvers } {
  const registry: RecordTypeRegistry = {};
  for (const { recordTypes } of modules) {
    Object.assign(registry, recordTypes);
  }
  return {
    name: "records",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(
      registry,
      createRecordHistoryReaderService(orm, registry),
      createRecordCloneService({ orm, transact, logger, registry }),
    ),
  };
}
