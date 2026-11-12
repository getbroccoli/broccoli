import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  createRecordHistoryReaderService,
  createRecordHistoryService,
  type CauseKinds,
  type HistoryLine,
} from "../../../core/records";
import type { Connection, PageArgs } from "../../../core/pagination";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import { taskRepository } from "../db";
import {
  cancelTask,
  groupMyTasks,
  isTaskVisibleTo,
  markTaskDone,
  markTaskWaiting,
  type MyTasks,
  reopenTask,
  resolvedRecentlySince,
  type Task,
  type TaskProcessSource,
  type TaskRecord,
  type TaskType,
} from "../domain";
import { taskRecordType } from "./taskRecordType";

/** A task a feature, a process step or the demo asks of someone: a person who asked, a process step, or both. */
export type NewTask = NewTaskFields &
  (
    | { askedByEmployeeId: string; processSource?: TaskProcessSource | null }
    | { askedByEmployeeId?: null; processSource: TaskProcessSource }
  );

interface NewTaskFields {
  type: TaskType;
  title: string;
  description?: string | null;
  assigneeEmployeeId: string;
  subjectEmployeeId?: string | null;
  record?: TaskRecord | null;
  dueDate?: CalendarDate | null;
  /** Why the task exists, for its history; a direct edit when left out. */
  cause?: TaskCause;
}

/** The cause a task's history line records. */
export type TaskCause = { kind: keyof CauseKinds; ref?: string | null };

/**
 * Work asked of people: created by features, read and finished by the people who hold or asked
 * for it. Only they see a task; anyone else gets NOT_FOUND, so its existence does not leak.
 */
export interface TaskService {
  /** Trusted, for features and the demo fill: a new task to do in `tx`; the caller authorizes. */
  createTask(ctx: SecurityContext, tx: Tx, task: NewTask): Promise<Task>;
  /** Trusted, for processes: the tasks among these ids, in `tx`; the caller authorizes. */
  readTasksInTransaction(tx: Tx, taskIds: readonly string[]): Promise<Task[]>;
  /** Trusted, for processes: its assignee marks a feature's task done in `tx`, first change winning. */
  markDoneInTransaction(ctx: SecurityContext, tx: Tx, taskId: string): Promise<Task>;
  /** Trusted, for processes: its assignee takes a feature's done task back to do, in `tx`. */
  reopenInTransaction(ctx: SecurityContext, tx: Tx, taskId: string): Promise<Task>;
  /** Trusted, for processes: cancels open tasks in `tx` with a reason their assignees read. */
  cancelInTransaction(
    ctx: SecurityContext,
    tx: Tx,
    input: { taskIds: readonly string[]; reason: string; cause: TaskCause },
  ): Promise<void>;
  /** Trusted: puts a task to do on hold in `tx`, until what it waits for happens. */
  markWaiting(ctx: SecurityContext, tx: Tx, taskId: string): Promise<Task>;
  /** The signed-in caller's tasks by where the ball is; all empty for a caller with no employee. */
  listMyTasks(ctx: SecurityContext): Promise<MyTasks>;
  /** A task the caller holds or asked for. */
  readTask(ctx: SecurityContext, taskId: string): Promise<Task>;
  /** A task's history, newest first, for its assignee and the person who asked; others get FORBIDDEN. */
  readTaskHistory(
    ctx: SecurityContext,
    taskId: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
  /** The assignee finishes a task to do. */
  markDone(ctx: SecurityContext, taskId: string): Promise<TaskChange>;
  /** The assignee takes a done task back to do. */
  reopen(ctx: SecurityContext, taskId: string): Promise<TaskChange>;
  /** The person who asked withdraws an open task, saying why. */
  cancel(ctx: SecurityContext, taskId: string, reason: string): Promise<TaskChange>;
  /**
   * Back to a fresh workspace when setup or the demo goes back to its start, after the employees,
   * whose deletion took their tasks: forgets the tasks' history.
   */
  resetTasks(ctx: SecurityContext, tx: Tx): Promise<void>;
}

/** A task after a change, with the history line the change appended. */
export interface TaskChange {
  task: Task;
  historyLine: HistoryLine;
}

export function createTaskService({
  orm,
  transact,
  logger,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger">): TaskService {
  const historyReader = createRecordHistoryReaderService(orm, { task: taskRecordType(orm) });
  return {
    async createTask(ctx, tx, { title, description = null, cause = DIRECT_EDIT, ...task }) {
      const created = await taskRepository(tx).insert({
        type: task.type,
        status: "to_do",
        title: requireText(title, "title"),
        description: description?.trim() || null,
        assigneeEmployeeId: task.assigneeEmployeeId,
        askedByEmployeeId: task.askedByEmployeeId ?? null,
        subjectEmployeeId: task.subjectEmployeeId ?? null,
        processSource: task.processSource ?? null,
        record: task.record ?? null,
        dueDate: task.dueDate ?? null,
        doneAt: null,
        doneByEmployeeId: null,
        cancelledAt: null,
        cancelReason: null,
      });
      await history.append(ctx, tx, {
        recordType: "task",
        operation: "CREATED",
        cause,
        records: [
          {
            recordId: created.id,
            changes: [
              { field: "title", oldValue: null, newValue: created.title },
              { field: "status", oldValue: null, newValue: created.status },
            ],
          },
        ],
      });
      return created;
    },

    readTasksInTransaction: (tx, taskIds) => taskRepository(tx).findByIds(taskIds),

    async markDoneInTransaction(ctx, tx, taskId) {
      const { task } = await changeLockedTask(ctx, tx, taskId, (locked, employeeId) => {
        refuseUnlessAssignee(locked, employeeId, MARK_DONE_REFUSAL);
        return markTaskDone(locked, employeeId, new Date());
      });
      return task;
    },

    async reopenInTransaction(ctx, tx, taskId) {
      const { task } = await changeLockedTask(ctx, tx, taskId, (locked, employeeId) => {
        refuseUnlessAssignee(locked, employeeId, REOPEN_REFUSAL);
        return reopenTask(locked);
      });
      return task;
    },

    async cancelInTransaction(ctx, tx, { taskIds, reason, cause }) {
      const tasks = taskRepository(tx);
      for (const task of await tasks.lockByIds(taskIds)) {
        if (task.status === "done" || task.status === "cancelled") continue;
        const saved = await tasks.saveStatus(
          cancelTask(task, requireText(reason, "reason"), new Date()),
        );
        await appendStatusChange(ctx, tx, task, saved, cause);
      }
    },

    async markWaiting(ctx, tx, taskId) {
      const tasks = taskRepository(tx);
      const task = await tasks.lockById(taskId);
      if (!task) {
        throw notFound();
      }
      const saved = await tasks.saveStatus(markTaskWaiting(task));
      await appendStatusChange(ctx, tx, task, saved);
      return saved;
    },

    async listMyTasks(ctx) {
      const employeeId = ctx.user?.employeeId ?? null;
      if (!employeeId) {
        return { needsYou: [], waitingOnOthers: [], resolvedRecently: [] };
      }
      const tasks = await taskRepository(orm).listForEmployee(
        employeeId,
        resolvedRecentlySince(new Date()),
      );
      return groupMyTasks(tasks, employeeId);
    },

    async readTask(ctx, taskId) {
      const id = parseUuid(taskId);
      return requireVisible(ctx, id ? await taskRepository(orm).findById(id) : null).task;
    },

    readTaskHistory: (ctx, taskId, args) => historyReader.readHistory(ctx, "task", taskId, args),

    async markDone(ctx, taskId) {
      const done = await changeTask(transact, ctx, taskId, (task, employeeId) => {
        refuseFeatureTask(task);
        refuseUnlessAssignee(task, employeeId, MARK_DONE_REFUSAL);
        return markTaskDone(task, employeeId, new Date());
      });
      logger.info({ taskId: done.task.id, type: done.task.type }, "Task marked done");
      return done;
    },

    async reopen(ctx, taskId) {
      const reopened = await changeTask(transact, ctx, taskId, (task, employeeId) => {
        refuseFeatureTask(task);
        refuseUnlessAssignee(task, employeeId, REOPEN_REFUSAL);
        return reopenTask(task);
      });
      logger.info({ taskId: reopened.task.id, type: reopened.task.type }, "Task reopened");
      return reopened;
    },

    async cancel(ctx, taskId, reason) {
      const cancelled = await changeTask(transact, ctx, taskId, (task, employeeId) => {
        refuseFeatureTask(task);
        if (task.askedByEmployeeId !== employeeId) {
          throw new ApplicationError(
            "FORBIDDEN",
            "Only the person who asked can cancel this task.",
          );
        }
        return cancelTask(task, requireText(reason, "reason"), new Date());
      });
      logger.info({ taskId: cancelled.task.id, type: cancelled.task.type }, "Task cancelled");
      return cancelled;
    },

    async resetTasks(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await history.purge(tx, "task");
    },
  };
}

/** Changes one task the caller may see, inside one transaction, with its history line. */
async function changeTask(
  transact: Transact,
  ctx: SecurityContext,
  taskId: string,
  change: (task: Task, employeeId: string) => Task,
): Promise<TaskChange> {
  return transact((tx) => changeLockedTask(ctx, tx, taskId, change));
}

/** Changes one task the caller may see, locked in `tx`, with the history line it appends. */
async function changeLockedTask(
  ctx: SecurityContext,
  tx: Tx,
  taskId: string,
  change: (task: Task, employeeId: string) => Task,
): Promise<TaskChange> {
  const tasks = taskRepository(tx);
  const id = parseUuid(taskId);
  const { task, employeeId } = requireVisible(ctx, id ? await tasks.lockById(id) : null);
  const saved = await tasks.saveStatus(change(task, employeeId));
  return { task: saved, historyLine: await appendStatusChange(ctx, tx, task, saved) };
}

async function appendStatusChange(
  ctx: SecurityContext,
  tx: Tx,
  before: Task,
  after: Task,
  cause: TaskCause = DIRECT_EDIT,
): Promise<HistoryLine> {
  const [line] = await history.append(ctx, tx, {
    recordType: "task",
    operation: "UPDATED",
    cause,
    reason: after.cancelReason,
    records: [
      {
        recordId: after.id,
        changes: [{ field: "status", oldValue: before.status, newValue: after.status }],
      },
    ],
  });
  return line!;
}

/** The task and the caller's employee, if the caller holds or asked for it; else NOT_FOUND. */
function requireVisible(
  ctx: SecurityContext,
  task: Task | null,
): { task: Task; employeeId: string } {
  const employeeId = ctx.user?.employeeId ?? null;
  if (task === null || employeeId === null || !isTaskVisibleTo(task, employeeId)) {
    throw notFound();
  }
  return { task, employeeId };
}

function refuseUnlessAssignee(task: Task, employeeId: string, message: string): void {
  if (task.assigneeEmployeeId !== employeeId) {
    throw new ApplicationError("FORBIDDEN", message);
  }
}

/** A feature's own task is finished through the feature, never the generic commands. */
function refuseFeatureTask(task: Task): void {
  if (task.type === "process_step_to_do") {
    throw new ApplicationError("CONFLICT", "This task belongs to a process.");
  }
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw invalidInput([{ field, code: "required" }]);
  }
  return trimmed;
}

function notFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No task has this id.");
}

const history = createRecordHistoryService();

const DIRECT_EDIT: TaskCause = { kind: "EDITED_DIRECTLY" };
const MARK_DONE_REFUSAL = "Only the person who holds this task can mark it done.";
const REOPEN_REFUSAL = "Only the person who holds this task can reopen it.";
