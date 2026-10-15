import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";

import { afterKeyset, type Orm, orderByKeyset, ormOf, type Tx } from "../../../core/db";
import {
  IMPORT_EMPLOYEE_VERSION,
  type ImportEmployee,
  type ImportEmployeeOrder,
  type FileSource,
  type ImportSource,
  type IncomingRecord,
  type MappingOutcome,
  parseImportEmployeeValues,
} from "../domain";
import {
  importEmployeeOrderColumns,
  type ImportEmployeeKeyset,
  matchesSearch,
} from "./importEmployeeOrder";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";

/** The import's sources and records, through the pool or inside a transaction. */
export interface ImportRepository {
  /** Creates the Slack source or renames it, marks it read now and returns its id. */
  saveSlackSource(name: string): Promise<string>;
  /** Adds an uploaded file as a source waiting for its first mapping run; returns its id. */
  insertFileSource(name: string, fileId: string): Promise<string>;
  /** The file source with this id, or null when there is none. */
  findFileSource(id: string): Promise<FileSource | null>;
  /**
   * Ends a mapping run, only while the source is still `mapping` at `attempt`; returns
   * whether it did. A late run, or one of a removed source, changes nothing.
   */
  finishMapping(id: string, attempt: number, outcome: MappingOutcome): Promise<boolean>;
  /** Starts the next mapping run of a failed file source; returns its attempt, or null. */
  restartMapping(id: string): Promise<number | null>;
  /** Deletes a file source and its records; returns its file's id, or null when there is none. */
  deleteFileSource(id: string): Promise<string | null>;
  /** Whether any source is still being mapped. */
  hasMappingSource(): Promise<boolean>;
  /**
   * Waits for and holds, until the transaction ends, the lock that Approve and the
   * operations starting a mapping run take first, so Approve never misses a run.
   */
  lockSources(): Promise<void>;
  /**
   * Makes the source's employee records match `records` by external id: updates the
   * ones still there, so their ids stay, adds new ones and deletes the rest.
   */
  syncEmployeeRecords(sourceId: string, records: IncomingRecord[]): Promise<void>;
  listSources(): Promise<ImportSource[]>;
  findSources(ids: readonly string[]): Promise<ImportSource[]>;
  /** Every employee record of every source, oldest first. */
  listEmployeeRecords(): Promise<ImportEmployee[]>;
  /** The number of employee records of each source that has any; the others are absent. */
  countEmployees(sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** Up to `first + 1` employee records after `after`, in `order`; the extra one signals a next page. */
  findEmployeePage(
    query: ImportEmployeePageQuery,
  ): Promise<{ node: ImportEmployee; keyset: ImportEmployeeKeyset }[]>;
}

export interface ImportEmployeePageQuery {
  first: number;
  after: ImportEmployeeKeyset | null;
  order: ImportEmployeeOrder;
  /** Part of a first name, last name or email; null lists every record. */
  search: string | null;
  /** Null lists the records of every source. */
  sourceId: string | null;
}

export function importRepository(db: Orm | Tx): ImportRepository {
  const orm = () => ormOf(db);

  return {
    saveSlackSource: async (name: string): Promise<string> => {
      const [row] = await orm()
        .insert(importSources)
        .values({ kind: "slack", name })
        .onConflictDoUpdate({
          target: importSources.kind,
          targetWhere: sql`${importSources.kind} = 'slack'`,
          set: { name, readAt: sql`now()` },
        })
        .returning({ id: importSources.id });
      return row!.id;
    },

    insertFileSource: async (name: string, fileId: string): Promise<string> => {
      const [row] = await orm()
        .insert(importSources)
        .values({ kind: "file", name, fileId, status: "mapping" })
        .returning({ id: importSources.id });
      return row!.id;
    },

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

    finishMapping: async (
      id: string,
      attempt: number,
      outcome: MappingOutcome,
    ): Promise<boolean> => {
      const rows = await orm()
        .update(importSources)
        .set({
          status: outcome.status,
          failure: outcome.status === "failed" ? outcome.failure : null,
          readAt: sql`now()`,
        })
        .where(
          and(
            eq(importSources.id, id),
            eq(importSources.status, "mapping"),
            eq(importSources.mappingAttempt, attempt),
          ),
        )
        .returning({ id: importSources.id });
      return rows.length > 0;
    },

    restartMapping: async (id: string): Promise<number | null> => {
      const [row] = await orm()
        .update(importSources)
        .set({
          status: "mapping",
          failure: null,
          mappingAttempt: sql`${importSources.mappingAttempt} + 1`,
        })
        .where(
          and(
            eq(importSources.id, id),
            eq(importSources.kind, "file"),
            eq(importSources.status, "failed"),
          ),
        )
        .returning({ mappingAttempt: importSources.mappingAttempt });
      return row?.mappingAttempt ?? null;
    },

    deleteFileSource: async (id: string): Promise<string | null> => {
      const [row] = await orm()
        .delete(importSources)
        .where(and(eq(importSources.id, id), eq(importSources.kind, "file")))
        .returning({ fileId: importSources.fileId });
      return row?.fileId ?? null;
    },

    hasMappingSource: async (): Promise<boolean> => {
      const [row] = await orm()
        .select({ id: importSources.id })
        .from(importSources)
        .where(eq(importSources.status, "mapping"))
        .limit(1);
      return row !== undefined;
    },

    lockSources: async (): Promise<void> => {
      await orm().execute(sql`select pg_advisory_xact_lock(hashtext(${SOURCES_LOCK_KEY}))`);
    },

    syncEmployeeRecords: async (sourceId: string, records: IncomingRecord[]): Promise<void> => {
      const ofSource = and(
        eq(importRecords.sourceId, sourceId),
        eq(importRecords.type, "employee"),
      )!;
      await orm()
        .delete(importRecords)
        .where(
          records.length === 0
            ? ofSource
            : and(
                ofSource,
                notInArray(
                  importRecords.externalId,
                  records.map(({ externalId }) => externalId),
                ),
              ),
        );
      for (let start = 0; start < records.length; start += INSERT_BATCH_SIZE) {
        await orm()
          .insert(importRecords)
          .values(
            records.slice(start, start + INSERT_BATCH_SIZE).map(({ externalId, raw, values }) => ({
              sourceId,
              type: "employee" as const,
              typeVersion: IMPORT_EMPLOYEE_VERSION,
              externalId,
              raw,
              values,
            })),
          )
          .onConflictDoUpdate({
            target: [importRecords.sourceId, importRecords.type, importRecords.externalId],
            set: {
              typeVersion: sql`excluded.type_version`,
              raw: sql`excluded.raw`,
              values: sql`excluded.values`,
              updatedAt: sql`now()`,
            },
          });
      }
    },

    listSources: (): Promise<ImportSource[]> =>
      orm().select(sourceColumns).from(importSources).orderBy(importSources.createdAt),

    findSources: (ids: readonly string[]): Promise<ImportSource[]> =>
      orm()
        .select(sourceColumns)
        .from(importSources)
        .where(inArray(importSources.id, [...ids])),

    listEmployeeRecords: async (): Promise<ImportEmployee[]> => {
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

    findEmployeePage: async ({
      first,
      after,
      order,
      search,
      sourceId,
    }: ImportEmployeePageQuery) => {
      const columns = importEmployeeOrderColumns(order);
      const keys = Object.fromEntries(
        columns.map(({ expression }, index) => [`key${index}`, expression]),
      );
      const rows = await orm()
        .select({ record: importRecords, ...keys })
        .from(importRecords)
        .where(
          and(
            eq(importRecords.type, "employee"),
            sourceId === null ? undefined : eq(importRecords.sourceId, sourceId),
            search === null ? undefined : matchesSearch(search),
            after === null ? undefined : afterKeyset(columns, after.slice(2)),
          ),
        )
        .orderBy(...orderByKeyset(columns))
        .limit(first + 1);
      return rows.map((row) => {
        const values = columns.map((_, index) => (row as Record<string, unknown>)[`key${index}`]);
        return {
          node: toImportEmployee(row.record),
          keyset: [order.field, order.direction, ...values] satisfies ImportEmployeeKeyset,
        };
      });
    },
  };
}

const SOURCES_LOCK_KEY = "broccoli.import_sources";

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

const sourceColumns = {
  id: importSources.id,
  kind: importSources.kind,
  name: importSources.name,
  readAt: importSources.readAt,
  status: importSources.status,
  failure: importSources.failure,
};

function toImportEmployee(record: typeof importRecords.$inferSelect): ImportEmployee {
  return {
    id: record.id,
    sourceId: record.sourceId,
    ...parseImportEmployeeValues(record.typeVersion, record.values),
  };
}
