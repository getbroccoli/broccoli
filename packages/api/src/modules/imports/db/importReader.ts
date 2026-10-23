import { and, count, eq, gt, inArray } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { KeysetRow } from "../../../core/pagination";
import {
  type FileSource,
  type ImportEmployeeChoices,
  type ImportEmployeeRecord,
  type ImportSource,
} from "../domain";
import { parseImportEmployeeChoices, toImportEmployee } from "./importEmployeeJson";
import { importChoices } from "./importChoicesTable";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";

/** Reads the import's sources, records and choices, through the pool or joining a transaction. */
export interface ImportReader {
  listSources(): Promise<ImportSource[]>;
  findSources(ids: readonly string[]): Promise<ImportSource[]>;
  /** The file source with this id, or null when there is none. */
  findFileSource(id: string): Promise<FileSource | null>;
  /** Every employee record of every source, oldest first. */
  listEmployeeRecords(): Promise<ImportEmployeeRecord[]>;
  /** The number of employee records of each source that has any; the others are absent. */
  countEmployees(sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** Up to `limit` of one source's employee records after the one with id `after`, oldest first. */
  findRecordPage(
    query: ImportRecordPageQuery,
  ): Promise<KeysetRow<ImportEmployeeRecord, [id: string]>[]>;
  /** What the owner settled for each group of records of `type`. */
  listChoices(type: "employee"): Promise<ImportEmployeeChoices[]>;
}

export interface ImportRecordPageQuery {
  sourceId: string;
  after: [id: string] | null;
  limit: number;
}

export function importReader(db: Orm | Tx): ImportReader {
  const orm = () => ormOf(db);

  return {
    listSources: (): Promise<ImportSource[]> =>
      orm().select(sourceColumns).from(importSources).orderBy(importSources.createdAt),

    findSources: (ids: readonly string[]): Promise<ImportSource[]> =>
      orm()
        .select(sourceColumns)
        .from(importSources)
        .where(inArray(importSources.id, [...ids])),

    findFileSource: async (id: string): Promise<FileSource | null> => {
      const [row] = await orm()
        .select({
          ...sourceColumns,
          fileId: importSources.fileId,
          mappingAttempt: importSources.mappingAttempt,
        })
        .from(importSources)
        .where(and(eq(importSources.id, id), eq(importSources.kind, "file")));
      return row ? { ...row, fileId: row.fileId! } : null;
    },

    listEmployeeRecords: async (): Promise<ImportEmployeeRecord[]> => {
      const records = await orm()
        .select()
        .from(importRecords)
        .where(eq(importRecords.type, "employee"))
        .orderBy(importRecords.createdAt, importRecords.id);
      return records.map(toImportEmployee);
    },

    countEmployees: async (sourceIds: readonly string[]): Promise<Map<string, number>> => {
      const rows = await orm()
        .select({ sourceId: importRecords.sourceId, count: count() })
        .from(importRecords)
        .where(
          and(eq(importRecords.type, "employee"), inArray(importRecords.sourceId, [...sourceIds])),
        )
        .groupBy(importRecords.sourceId);
      return new Map(rows.map(({ sourceId, count }) => [sourceId, count]));
    },

    findRecordPage: async ({ sourceId, after, limit }: ImportRecordPageQuery) => {
      const records = await orm()
        .select()
        .from(importRecords)
        .where(
          and(
            eq(importRecords.type, "employee"),
            eq(importRecords.sourceId, sourceId),
            after === null ? undefined : gt(importRecords.id, after[0]),
          ),
        )
        // uuidv7 ids follow the order the records were added in.
        .orderBy(importRecords.id)
        .limit(limit);
      return records.map((record) => ({ node: toImportEmployee(record), values: [record.id] }));
    },

    listChoices: async (type: "employee"): Promise<ImportEmployeeChoices[]> => {
      const rows = await orm().select().from(importChoices).where(eq(importChoices.type, type));
      return rows.map(({ key, leftOut, typeVersion, values }) => ({
        key,
        leftOut,
        values: parseImportEmployeeChoices(typeVersion, values),
      }));
    },
  };
}

const sourceColumns = {
  id: importSources.id,
  kind: importSources.kind,
  name: importSources.name,
  readAt: importSources.readAt,
  status: importSources.status,
  failure: importSources.failure,
  failureMessage: importSources.failureMessage,
  readBy: importSources.readBy,
  pickedUpByExternalAgentAt: importSources.pickedUpByExternalAgentAt,
  originalReadAllowedAt: importSources.originalReadAllowedAt,
  originalReadAiSource: importSources.originalReadAiSource,
};
