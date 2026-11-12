import { and, eq, gte, inArray, or } from "drizzle-orm";

import { ormOf, type Orm, type Tx } from "../../../core/db";
import type { Task } from "../domain";
import { tasks } from "./tasksTable";

/** A task as it is stored before it has an id and timestamps. */
export type NewTaskRow = Omit<Task, "id" | "createdAt" | "updatedAt">;

/** Stored tasks. */
export interface TaskRepository {
  /** Inserts the tasks in batches; returns them in the same order. */
  insert(tasks: readonly NewTaskRow[]): Promise<Task[]>;
  findById(id: string): Promise<Task | null>;
  findByIds(ids: readonly string[]): Promise<Task[]>;
  /** The task with this id, or null, locked until the transaction ends, so the first change wins. */
  lockById(id: string): Promise<Task | null>;
  /** The tasks among these ids, locked in id order until the transaction ends. */
  lockByIds(ids: readonly string[]): Promise<Task[]>;
  /** Every task, locked in id order until the transaction ends. */
  lockAll(): Promise<void>;
  /** Writes the task's status and the columns that follow it. */
  saveStatus(task: Task): Promise<Task>;
  /**
   * The tasks the employee holds or asked for that are open, or that were done or cancelled
   * at or after `closedSince`.
   */
  listForEmployee(employeeId: string, closedSince: Date): Promise<Task[]>;
}

export function taskRepository(db: Orm | Tx): TaskRepository {
  const orm = ormOf(db);
  return {
    async insert(newTasks) {
      const inserted: Task[] = [];
      for (let start = 0; start < newTasks.length; start += INSERT_BATCH_SIZE) {
        const batch = newTasks.slice(start, start + INSERT_BATCH_SIZE);
        const rows = await orm.insert(tasks).values(batch.map(toRow)).returning();
        inserted.push(...rows.map(toTask));
      }
      return inserted;
    },

    async findById(id) {
      const [row] = await orm.select().from(tasks).where(eq(tasks.id, id));
      return row ? toTask(row) : null;
    },

    async findByIds(ids) {
      const rows = await orm
        .select()
        .from(tasks)
        .where(inArray(tasks.id, [...ids]));
      return rows.map(toTask);
    },

    async lockAll() {
      await orm.select({ id: tasks.id }).from(tasks).orderBy(tasks.id).for("update");
    },

    async lockByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await orm
        .select()
        .from(tasks)
        .where(inArray(tasks.id, [...ids]))
        .orderBy(tasks.id)
        .for("update");
      return rows.map(toTask);
    },

    async lockById(id) {
      const [row] = await orm.select().from(tasks).where(eq(tasks.id, id)).for("update");
      return row ? toTask(row) : null;
    },

    async saveStatus({ id, status, doneAt, doneByEmployeeId, cancelledAt, cancelReason }) {
      const [row] = await orm
        .update(tasks)
        .set({ status, doneAt, doneByEmployeeId, cancelledAt, cancelReason, updatedAt: new Date() })
        .where(eq(tasks.id, id))
        .returning();
      return toTask(row!);
    },

    async listForEmployee(employeeId, closedSince) {
      const rows = await orm
        .select()
        .from(tasks)
        .where(
          and(
            or(eq(tasks.assigneeEmployeeId, employeeId), eq(tasks.askedByEmployeeId, employeeId)),
            or(
              inArray(tasks.status, ["to_do", "waiting"]),
              gte(tasks.doneAt, closedSince),
              gte(tasks.cancelledAt, closedSince),
            ),
          ),
        );
      return rows.map(toTask);
    },
  };
}

type TaskRow = typeof tasks.$inferSelect;

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

function toRow({ processSource, record, ...task }: NewTaskRow) {
  return {
    ...task,
    processKey: processSource?.processKey ?? null,
    processRunId: processSource?.processRunId ?? null,
    stepKey: processSource?.stepKey ?? null,
    recordType: record?.recordType ?? null,
    recordId: record?.recordId ?? null,
  };
}

function toTask({
  processKey,
  processRunId,
  stepKey,
  recordType,
  recordId,
  ...row
}: TaskRow): Task {
  return {
    ...row,
    processSource: processKey && stepKey ? { processKey, processRunId, stepKey } : null,
    record: recordType && recordId ? { recordType, recordId } : null,
  };
}
