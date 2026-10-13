import { and, count, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  afterKeyset,
  keysetOrder,
  type KeysetOrder,
  type Orm,
  orderByKeyset,
  ormOf,
  type Tx,
} from "../../../core/db";
import {
  IMPORT_EMPLOYEE_VERSION,
  type ImportEmployee,
  type ImportSource,
  type IncomingRecord,
  parseImportEmployeeValues,
} from "../domain";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";
import { slackConnection } from "./slackConnectionTable";

/** The sort values of the last employee record seen: first name, last name, id. */
export type ImportEmployeeKeyset = [firstName: string, lastName: string, id: string];

export const importEmployeeKeyset: z.ZodType<ImportEmployeeKeyset> = z.tuple([
  z.string(),
  z.string(),
  z.uuid(),
]);

export interface ImportEmployeePageQuery {
  first: number;
  after: ImportEmployeeKeyset | null;
  /** Null lists the records of every source. */
  sourceId: string | null;
}

export interface StoredSlackConnection {
  teamId: string;
  teamName: string;
  sealedToken: string;
}

export type ImportRepository = ReturnType<typeof importRepository>;

/** The import's sources, records and Slack connection, through the pool or inside a transaction. */
export function importRepository(db: Orm | Tx) {
  const orm = () => ormOf(db);

  return {
    readSlackConnection: async (): Promise<StoredSlackConnection | null> => {
      const [row] = await orm().select(connectionColumns).from(slackConnection);
      return row ?? null;
    },

    /** Like `readSlackConnection`, and locks the row until the transaction ends. */
    lockSlackConnection: async (): Promise<StoredSlackConnection | null> => {
      const [row] = await orm().select(connectionColumns).from(slackConnection).for("update");
      return row ?? null;
    },

    saveSlackConnection: async (connection: StoredSlackConnection): Promise<void> => {
      await orm()
        .insert(slackConnection)
        .values(connection)
        .onConflictDoUpdate({
          target: slackConnection.id,
          set: { ...connection, connectedAt: sql`now()` },
        });
    },

    /** Creates the Slack source or renames it, marks it read now and returns its id. */
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

    /**
     * Makes the source's employee records match `records` by external id: updates the
     * ones still there, so their ids stay, adds new ones and deletes the rest.
     */
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

    /** The number of employee records of each source that has any; the others are absent. */
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

    /** Up to `first + 1` employee records after `after`, by name; the extra one signals a next page. */
    findEmployeePage: async ({ first, after, sourceId }: ImportEmployeePageQuery) => {
      const rows = await orm()
        .select({ record: importRecords, firstName: FIRST_NAME, lastName: LAST_NAME })
        .from(importRecords)
        .where(
          and(
            eq(importRecords.type, "employee"),
            sourceId === null ? undefined : eq(importRecords.sourceId, sourceId),
            after === null ? undefined : afterKeyset(EMPLOYEE_ORDER, after),
          ),
        )
        .orderBy(...orderByKeyset(EMPLOYEE_ORDER))
        .limit(first + 1);
      return rows.map(({ record, firstName, lastName }) => ({
        node: toImportEmployee(record),
        keyset: [firstName, lastName, record.id] satisfies ImportEmployeeKeyset,
      }));
    },
  };
}

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

const connectionColumns = {
  teamId: slackConnection.teamId,
  teamName: slackConnection.teamName,
  sealedToken: slackConnection.sealedToken,
};

const sourceColumns = {
  id: importSources.id,
  kind: importSources.kind,
  name: importSources.name,
  readAt: importSources.readAt,
};

const nameField = (field: string): SQL<string> =>
  sql<string>`lower(coalesce(${importRecords.values}->>${field}, ''))`;
const FIRST_NAME = nameField("firstName");
const LAST_NAME = nameField("lastName");

const EMPLOYEE_ORDER: KeysetOrder = keysetOrder(
  [
    { expression: FIRST_NAME, descending: false },
    { expression: LAST_NAME, descending: false },
  ],
  sql`${importRecords.id}`,
  false,
);

function toImportEmployee(record: typeof importRecords.$inferSelect): ImportEmployee {
  return {
    id: record.id,
    sourceId: record.sourceId,
    ...parseImportEmployeeValues(record.typeVersion, record.values),
  };
}
