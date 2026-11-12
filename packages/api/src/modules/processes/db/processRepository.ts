import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { ormOf, type Orm, type Tx } from "../../../core/db";
import { inRecordScope, type RecordScope } from "../../../core/security";
import type { ProcessRun, RunStep } from "../domain";
import { processes, processVersions } from "./processesTable";
import { processRuns, processRunSteps } from "./processRunsTable";

/** A process with the stored definition of its active version, not yet parsed. */
export interface StoredProcess {
  id: string;
  key: string;
  name: string;
  description: string;
  turnedOnAt: Date | null;
  activeVersion: { id: string; version: number; schemaVersion: number; definition: unknown };
}

/** A run as it is stored before it has an id and timestamps. */
export type NewRunRow = Omit<ProcessRun, "id" | "createdAt" | "updatedAt">;

/** Stored processes, their versions, runs and run steps. */
export interface ProcessRepository {
  listProcesses(): Promise<StoredProcess[]>;
  findProcessByKey(key: string): Promise<StoredProcess | null>;
  findProcessesByIds(ids: readonly string[]): Promise<StoredProcess[]>;
  /** A version's stored definition, not yet parsed; null when no version has the id. */
  findVersion(id: string): Promise<{ schemaVersion: number; definition: unknown } | null>;
  /** The process, locked until the transaction ends, so every way of starting a run takes turns. */
  lockProcess(id: string): Promise<void>;
  setTurnedOnAt(id: string, turnedOnAt: Date | null): Promise<void>;
  insertRun(run: NewRunRow): Promise<ProcessRun>;
  insertSteps(steps: readonly RunStep[]): Promise<void>;
  findRun(id: string): Promise<ProcessRun | null>;
  /** The run, locked until the transaction ends, so step changes on it take turns. */
  lockRun(id: string): Promise<ProcessRun | null>;
  saveRun(run: ProcessRun): Promise<ProcessRun>;
  saveSteps(steps: readonly RunStep[]): Promise<void>;
  /** The run's steps, in no particular order. */
  findSteps(runId: string): Promise<RunStep[]>;
  /** The runs of the process whose subject is in `scope`, newest first; FORBIDDEN for "none". */
  listRuns(processId: string, scope: RecordScope): Promise<ProcessRun[]>;
  /** Every run in progress, of every process. */
  listRunsInProgress(): Promise<ProcessRun[]>;
  /** The records among these that already had any run of the process. */
  findRecordsWithRuns(
    processId: string,
    recordType: string,
    recordIds: readonly string[],
  ): Promise<Set<string>>;
  /** The record's run of the process in progress, if any. */
  findRunInProgress(
    processId: string,
    recordType: string,
    recordId: string,
  ): Promise<ProcessRun | null>;
  /** Back to a fresh workspace: deletes every run (their steps and tasks with them), turns every process off. */
  reset(): Promise<void>;
}

export function processRepository(db: Orm | Tx): ProcessRepository {
  const orm = ormOf(db);
  const selectProcesses = () =>
    orm
      .select({
        process: processes,
        version: {
          id: processVersions.id,
          version: processVersions.version,
          schemaVersion: processVersions.definitionSchemaVersion,
          definition: processVersions.definition,
        },
      })
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
        .select({
          schemaVersion: processVersions.definitionSchemaVersion,
          definition: processVersions.definition,
        })
        .from(processVersions)
        .where(eq(processVersions.id, id));
      return row ?? null;
    },

    async lockProcess(id) {
      await orm
        .select({ id: processes.id })
        .from(processes)
        .where(eq(processes.id, id))
        .for("update");
    },

    async setTurnedOnAt(id, turnedOnAt) {
      await orm
        .update(processes)
        .set({ turnedOnAt, updatedAt: new Date() })
        .where(eq(processes.id, id));
    },

    async insertRun(run) {
      const [row] = await orm.insert(processRuns).values(run).returning();
      return row!;
    },

    async insertSteps(steps) {
      if (steps.length > 0) await orm.insert(processRunSteps).values([...steps]);
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
      return row ?? null;
    },

    async saveRun(run) {
      const [row] = await orm
        .update(processRuns)
        .set({ ...run, updatedAt: new Date() })
        .where(eq(processRuns.id, run.id))
        .returning();
      return row!;
    },

    async saveSteps(steps) {
      for (const { runId, stepKey, ...step } of steps) {
        await orm
          .update(processRunSteps)
          .set(step)
          .where(and(eq(processRunSteps.runId, runId), eq(processRunSteps.stepKey, stepKey)));
      }
    },

    async findSteps(runId) {
      return orm.select().from(processRunSteps).where(eq(processRunSteps.runId, runId));
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

    async findRecordsWithRuns(processId, recordType, recordIds) {
      if (recordIds.length === 0) return new Set();
      const rows = await orm
        .selectDistinct({ recordId: processRuns.recordId })
        .from(processRuns)
        .where(
          and(
            eq(processRuns.processId, processId),
            eq(processRuns.recordType, recordType),
            sql`${processRuns.recordId} = any(${sql.param([...recordIds])}::text[])`,
          ),
        );
      return new Set(rows.map(({ recordId }) => recordId));
    },

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
      await orm.update(processes).set({ turnedOnAt: null, updatedAt: new Date() });
    },
  };
}

type ProcessWithVersionRow = {
  process: typeof processes.$inferSelect;
  version: StoredProcess["activeVersion"];
};

function toStoredProcess({ process, version }: ProcessWithVersionRow): StoredProcess {
  return {
    id: process.id,
    key: process.key,
    name: process.name,
    description: process.description,
    turnedOnAt: process.turnedOnAt,
    activeVersion: version,
  };
}
