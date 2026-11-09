import { and, eq, gte, inArray, or } from "drizzle-orm";

import { ormOf, type Orm, type Tx } from "../../../core/db";
import type { Task } from "../domain";
import { tasks } from "./tasksTable";

/** A task as it is stored before it has an id and timestamps. */
export type NewTaskRow = Omit<Task, "id" | "createdAt" | "updatedAt">;

/** Stored tasks. */
export interface TaskRepository {
  insert(task: NewTaskRow): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  findByIds(ids: readonly string[]): Promise<Task[]>;
  /** The task with this id, or null, locked until the transaction ends, so the first change wins. */
  lockById(id: string): Promise<Task | null>;
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
    async insert(task) {
      const [row] = await orm.insert(tasks).values(toRow(task)).returning();
      return toTask(row!);
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
            or(
              eq(tasks.assigneeEmployeeId, employeeId),
              eq(tasks.requestedByEmployeeId, employeeId),
            ),
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

function toRow({ processSource, subject, ...task }: NewTaskRow) {
  return {
    ...task,
    processKey: processSource?.processKey ?? null,
    processRunId: processSource?.processRunId ?? null,
    stepKey: processSource?.stepKey ?? null,
    recordType: subject?.recordType ?? null,
    recordId: subject?.recordId ?? null,
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
    subject: recordType && recordId ? { recordType, recordId } : null,
  };
}
