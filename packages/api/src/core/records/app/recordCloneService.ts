import { invalidInput } from "../../applicationError";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import type { SecurityContext } from "../../security";
import type { RecordType } from "../domain";
import {
  createRecordHistoryReaderService,
  type LoadedRecord,
  type RecordTypeRegistry,
} from "./recordHistoryReaderService";

/** Starts a new record from an existing one, for the record types whose module can clone them. */
export interface RecordCloneService {
  /** The new record; refuses a type that cannot be cloned as invalid input on `recordType`. */
  cloneRecord: (
    ctx: SecurityContext,
    input: { recordType: RecordType; id: string; name: string },
  ) => Promise<LoadedRecord>;
}

export function createRecordCloneService({
  orm,
  transact,
  logger,
  registry,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  registry: RecordTypeRegistry;
}): RecordCloneService {
  const reader = createRecordHistoryReaderService(orm, registry);
  return {
    async cloneRecord(ctx, { recordType, id, name }) {
      const clone = registry[recordType]?.clone;
      if (!clone) {
        throw invalidInput([{ field: "recordType", code: "not_cloneable" }]);
      }
      const cloneId = await transact((tx) => clone(ctx, tx, { id, name }));
      logger.info({ recordType, sourceId: id, cloneId }, "Cloned a record");
      return (await reader.readRecords(ctx, recordType, [cloneId])).get(cloneId)!;
    },
  };
}
