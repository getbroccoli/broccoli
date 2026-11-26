import { and, desc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";

import { ormOf, type Orm, type OrmTransaction, type Tx } from "../../db";
import { inRecordScope, type RecordScope } from "../../security";
import { PROCESS_DEFINITION_SCHEMA_VERSION, ProcessRun, type ProcessRunFields } from "../domain";
import { processes, processVersions } from "./processesTable";
import { processRuns, resultColumnsOf, runStepProgress, toRunStep } from "./processRunsTable";

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
export const INSERT_BATCH_SIZE = 1_000;

/** A process with the stored definition of its active version, not yet parsed. */
export interface StoredProcess {
  id: string;
  key: string;
  name: string;
  description: string;
  turnedOnAt: Date | null;
  activeVersion: { id: string; version: number; schemaVersion: number; definition: unknown };
}

/** A process to insert, with the definition of its first version. */
export interface NewProcessRow {
  key: string;
  name: string;
  description: string;
  definition: unknown;
  turnedOnAt: Date | null;
}

/** A run as it is stored before it has an id and timestamps. */
export type NewRunRow = Omit<ProcessRunFields, "id" | "createdAt" | "updatedAt">;

/** Stored processes, their versions, and runs with their steps; `runStepRepository` has the steps alone. */
export interface ProcessRepository {
  listProcesses(): Promise<StoredProcess[]>;
  findProcessByKey(key: string): Promise<StoredProcess | null>;
  findProcessesByIds(ids: readonly string[]): Promise<StoredProcess[]>;
  /** A version's stored definition, not yet parsed; null when no version has the id. */
  findVersion(id: string): Promise<StoredProcess["activeVersion"] | null>;
  /**
   * The process, locked until the transaction ends, so the daily job, an admin's start, step
   * commands and resets take turns. The lock leaves new runs' foreign keys free, so a change that
   * starts a run from an event never waits for it.
   */
  lockProcess(id: string): Promise<void>;
  /** Every process, locked as `lockProcess` does, in id order. */
  lockAllProcesses(): Promise<void>;
  /** The turned-on processes whose active version starts on one of these events, unlocked. */
  findProcessesStartedBy(eventTypes: readonly string[]): Promise<StoredProcess[]>;
  /** A new process with its first version, published and active; for tests and seeds. */
  insertProcess(process: NewProcessRow): Promise<{ id: string; key: string }>;
  setTurnedOnAt(id: string, turnedOnAt: Date | null): Promise<void>;
  /** Inserts the runs in batches; returns them in the same order. */
  insertRuns(runs: readonly NewRunRow[]): Promise<ProcessRunFields[]>;
  findRun(id: string): Promise<ProcessRunFields | null>;
  /** The run with its steps, locked until the transaction ends, so changes to it take turns. */
  lockRun(id: string): Promise<ProcessRun | null>;
  /**
   * The runs among these ids with their steps, share-locked until the transaction ends, so a step
   * change committing meanwhile cannot pair its steps with the old status.
   */
  readRunsWithSteps(ids: readonly string[]): Promise<ProcessRun[]>;
  /** Writes the run and its steps' status. */
  saveRun(run: ProcessRun): Promise<void>;
  /** The runs of the process whose subject is in `scope`, newest first; FORBIDDEN for "none". */
  listRuns(processId: string, scope: RecordScope): Promise<ProcessRunFields[]>;
  /** Every run in progress, of every process. */
  listRunsInProgress(): Promise<ProcessRunFields[]>;
  /** The records among these that already had any run of the process. */
  findRecordsWithRuns(
    processId: string,
    recordType: string,
    recordIds: readonly string[],
  ): Promise<Set<string>>;
  /** The records among these with a run of the process in progress. */
  findRecordsWithRunInProgress(
    processId: string,
    recordType: string,
    recordIds: readonly string[],
  ): Promise<Set<string>>;
  /** The records among these whose run of the process has the start key given with it. */
  findRecordsWithStartKeys(
    processId: string,
    recordType: string,
    starts: readonly { recordId: string; startKey: string }[],
  ): Promise<Set<string>>;
  /** The record's run of the process in progress, if any. */
  findRunInProgress(
    processId: string,
    recordType: string,
    recordId: string,
  ): Promise<ProcessRunFields | null>;
  /** Back to a fresh workspace: deletes every run (their steps and tasks with them), turns every built-in process on and every other off. */
  reset(): Promise<void>;
}

export function processRepository(db: Orm | Tx): ProcessRepository {
  const orm = ormOf(db);
  const selectProcesses = () =>
    orm
      .select({ process: processes, version: VERSION_COLUMNS })
      .from(processes)
      .innerJoin(processVersions, eq(processVersions.id, processes.activeVersionId));
  return {
    async listProcesses() {
      return (await selectProcesses().orderBy(processes.name)).map(toStoredProcess);
    },

    async findProcessByKey(key) {
      const [row] = await selectProcesses().where(eq(processes.key, key));
      return row ? toStoredProcess(row) : null;
    },

    async findProcessesByIds(ids) {
      return (await selectProcesses().where(inArray(processes.id, [...ids]))).map(toStoredProcess);
    },

    async findVersion(id) {
      const [row] = await orm
        .select(VERSION_COLUMNS)
        .from(processVersions)
        .where(eq(processVersions.id, id));
      return row ?? null;
    },

    async lockProcess(id) {
      await orm
        .select({ id: processes.id })
        .from(processes)
        .where(eq(processes.id, id))
        .for("no key update");
    },

    async lockAllProcesses() {
      await orm
        .select({ id: processes.id })
        .from(processes)
        .orderBy(processes.id)
        .for("no key update");
    },

    async findProcessesStartedBy(eventTypes) {
      const rows = await selectProcesses()
        .where(
          and(
            isNotNull(processes.turnedOnAt),
            sql`${processVersions.definition} -> 'trigger' ->> 'kind' = 'on_event'`,
            sql`${processVersions.definition} -> 'trigger' ->> 'event' = any(${sql.param([...eventTypes])}::text[])`,
          ),
        )
        .orderBy(processes.id);
      return rows.map(toStoredProcess);
    },

    async insertProcess({ definition, ...process }) {
      const [inserted] = await orm.insert(processes).values(process).returning();
      const [version] = await orm
        .insert(processVersions)
        .values({
          processId: inserted!.id,
          version: 1,
          status: "published",
          definitionSchemaVersion: PROCESS_DEFINITION_SCHEMA_VERSION,
          definition,
        })
        .returning();
      await orm
        .update(processes)
        .set({ activeVersionId: version!.id })
        .where(eq(processes.id, inserted!.id));
      return { id: inserted!.id, key: inserted!.key };
    },

    async setTurnedOnAt(id, turnedOnAt) {
      await orm
        .update(processes)
        .set({ turnedOnAt, updatedAt: new Date() })
        .where(eq(processes.id, id));
    },

    async insertRuns(runs) {
      const inserted: ProcessRunFields[] = [];
      for (let start = 0; start < runs.length; start += INSERT_BATCH_SIZE) {
        const batch = runs.slice(start, start + INSERT_BATCH_SIZE);
        inserted.push(...(await orm.insert(processRuns).values(batch).returning()));
      }
      return inserted;
    },

    async findRun(id) {
      const [row] = await orm.select().from(processRuns).where(eq(processRuns.id, id));
      return row ?? null;
    },

    async lockRun(id) {
      const [row] = await orm
        .select()
        .from(processRuns)
        .where(eq(processRuns.id, id))
        .for("update");
      if (!row) return null;
      const steps = await orm.select().from(runStepProgress).where(eq(runStepProgress.runId, id));
      return ProcessRun.restore(row, steps.map(toRunStep));
    },

    async readRunsWithSteps(ids) {
      if (ids.length === 0) return [];
      const rows = await orm
        .select()
        .from(processRuns)
        .where(inArray(processRuns.id, [...ids]))
        .for("share");
      const steps = await orm
        .select()
        .from(runStepProgress)
        .where(inArray(runStepProgress.runId, [...ids]));
      return rows.map((row) =>
        ProcessRun.restore(row, steps.filter(({ runId }) => runId === row.id).map(toRunStep)),
      );
    },

    async saveRun({ steps, ...run }) {
      await orm
        .update(processRuns)
        .set({ ...run, updatedAt: new Date() })
        .where(eq(processRuns.id, run.id));
      // Only what a run changes: a step's task reference is the database's to clear.
      for (const { runId, stepKey, status, finishedAt, result } of steps) {
        await orm
          .update(runStepProgress)
          .set({ status, finishedAt, ...resultColumnsOf({ result }) })
          .where(and(eq(runStepProgress.runId, runId), eq(runStepProgress.stepKey, stepKey)));
      }
    },

    async listRuns(processId, scope) {
      return await orm
        .select()
        .from(processRuns)
        .where(
          and(
            eq(processRuns.processId, processId),
            inRecordScope(scope, processRuns.subjectEmployeeId),
          ),
        )
        .orderBy(desc(processRuns.createdAt), desc(processRuns.id));
    },

    async listRunsInProgress() {
      return await orm.select().from(processRuns).where(eq(processRuns.status, "in_progress"));
    },

    findRecordsWithRuns: (processId, recordType, recordIds) =>
      findRecordsWithRunsWhere(orm, { processId, recordType, recordIds }),

    findRecordsWithRunInProgress: (processId, recordType, recordIds) =>
      findRecordsWithRunsWhere(
        orm,
        { processId, recordType, recordIds },
        eq(processRuns.status, "in_progress"),
      ),

    findRecordsWithStartKeys: (processId, recordType, starts) =>
      findRecordsWithRunsWhere(
        orm,
        { processId, recordType, recordIds: starts.map(({ recordId }) => recordId) },
        inArray(
          processRuns.startKey,
          starts.map(({ startKey }) => startKey),
        ),
      ),

    async findRunInProgress(processId, recordType, recordId) {
      const [row] = await orm
        .select()
        .from(processRuns)
        .where(
          and(
            eq(processRuns.processId, processId),
            eq(processRuns.recordType, recordType),
            eq(processRuns.recordId, recordId),
            eq(processRuns.status, "in_progress"),
          ),
        );
      return row ?? null;
    },

    async reset() {
      await orm.delete(processRuns);
      const now = new Date();
      // Built-in processes start on in a fresh workspace, as the migration seeds them.
      await orm
        .update(processes)
        .set({ turnedOnAt: now, updatedAt: now })
        .where(eq(processes.builtIn, true));
      await orm
        .update(processes)
        .set({ turnedOnAt: null, updatedAt: now })
        .where(eq(processes.builtIn, false));
    },
  };
}

/** A version as `StoredProcess` keeps it. */
const VERSION_COLUMNS = {
  id: processVersions.id,
  version: processVersions.version,
  schemaVersion: processVersions.definitionSchemaVersion,
  definition: processVersions.definition,
};

/** The records among these with a run of the process that also meets `condition`. */
async function findRecordsWithRunsWhere(
  orm: Orm | OrmTransaction,
  {
    processId,
    recordType,
    recordIds,
  }: { processId: string; recordType: string; recordIds: readonly string[] },
  condition?: SQL,
): Promise<Set<string>> {
  if (recordIds.length === 0) return new Set();
  const rows = await orm
    .selectDistinct({ recordId: processRuns.recordId })
    .from(processRuns)
    .where(
      and(
        eq(processRuns.processId, processId),
        eq(processRuns.recordType, recordType),
        sql`${processRuns.recordId} = any(${sql.param([...recordIds])}::text[])`,
        condition,
      ),
    );
  return new Set(rows.map(({ recordId }) => recordId));
}

type ProcessWithVersionRow = {
  process: typeof processes.$inferSelect;
  version: StoredProcess["activeVersion"];
};

function toStoredProcess({ process, version }: ProcessWithVersionRow): StoredProcess {
  const { id, key, name, description, turnedOnAt } = process;
  return { id, key, name, description, turnedOnAt, activeVersion: version };
}
