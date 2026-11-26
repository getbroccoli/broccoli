import { ApplicationError } from "../../applicationError";
import type { Tx } from "../../db";
import type { ModuleDependencies } from "../../moduleManifest";
import {
  createRecordHistoryReaderService,
  createRecordHistoryService,
  type HistoryLine,
} from "../../records";
import type { Connection, PageArgs } from "../../pagination";
import type { SecurityContext } from "../../security";
import { parseUuid } from "../../../utils";
import { taskRepository } from "../db";
import { createTasks, DIRECT_EDIT, type NewTask, requireText, type TaskCause } from "./createTasks";
import { issueDecisionToken, redeemDecisionToken } from "./decisionTokens";
import {
  groupMyTasks,
  type MyTasks,
  resolvedRecentlySince,
  resultText,
  type Task,
  type TaskResult,
} from "../domain";
import { taskRecordType } from "./taskRecordType";

/**
 * Work asked of people: created by features, read and finished by the people who hold or asked
 * for it. Only they see a task; anyone else gets NOT_FOUND, so its existence does not leak.
 */
export interface TaskService {
  /** Trusted, for features and the demo fill: a new task to do in `tx`; the caller authorizes. */
  createTask(ctx: SecurityContext, tx: Tx, task: NewTask): Promise<Task>;
  /** Trusted, for processes: new tasks to do in `tx`, with one insert, returned in the same order. */
  createTasks(ctx: SecurityContext, tx: Tx, tasks: readonly NewTask[]): Promise<Task[]>;
  /** Trusted, for processes: the tasks among these ids, in `tx`; the caller authorizes. */
  readTasksInTransaction(tx: Tx, taskIds: readonly string[]): Promise<Task[]>;
  /** Trusted, for processes: cancels open tasks in `tx` with a reason their assignees read. */
  cancelInTransaction(
    ctx: SecurityContext,
    tx: Tx,
    input: { taskIds: readonly string[]; reason: string; cause: TaskCause },
  ): Promise<void>;
  /**
   * Trusted, for processes: locks these tasks in id order until `tx` ends, before what a task's
   * change locks after it, such as its run.
   */
  lockInTransaction(tx: Tx, taskIds: readonly string[]): Promise<void>;
  /** The signed-in caller's tasks by where the ball is; all empty for a caller with no employee. */
  listMyTasks(ctx: SecurityContext): Promise<MyTasks>;
  /** A task the caller holds or asked for. */
  readTask(ctx: SecurityContext, taskId: string): Promise<Task>;
  /**
   * A one-time token for deciding this task on a card in the caller's connected agent: their own
   * open task with a result form; valid for an hour, for this connection only.
   */
  issueDecisionToken(
    ctx: SecurityContext,
    taskId: string,
  ): Promise<{ token: string; expiresAt: Date }>;
  /** A task's history, newest first, for its assignee and the person who asked; others get FORBIDDEN. */
  readTaskHistory(
    ctx: SecurityContext,
    taskId: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
  /**
   * The assignee finishes a task to do, whatever created it, with a result when it has a form; a
   * feature follows from the task's status change before the commit, in the same transaction.
   */
  markDone(ctx: SecurityContext, taskId: string, input?: MarkDoneInput): Promise<TaskChange>;
  /** The person who asked deletes an open task; a feature's task has nobody who asked. */
  deleteTask(ctx: SecurityContext, taskId: string): Promise<{ deletedTaskId: string }>;
  /**
   * Trusted, for resets: locks every task until the transaction ends, before the employees whose
   * deletion takes their tasks, so a reset waits for a task change instead of deadlocking with it.
   */
  lockTasks(ctx: SecurityContext, tx: Tx): Promise<void>;
  /**
   * Back to a fresh workspace when setup or the demo goes back to its start, after the employees,
   * whose deletion took their tasks: forgets the tasks' history.
   */
  resetTasks(ctx: SecurityContext, tx: Tx): Promise<void>;
}

/** What the assignee gives with Mark done. */
export interface MarkDoneInput {
  /** Required by a task with a form, refused by one without. */
  result?: TaskResult | null;
  /** Required when a connected agent calls: the token of the card the person pressed. */
  decisionToken?: string | null;
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
    async createTask(ctx, tx, task) {
      const [created] = await createTasks(ctx, tx, [task]);
      return created!;
    },

    createTasks,

    readTasksInTransaction: (tx, taskIds) => taskRepository(tx).findByIds(taskIds),

    async cancelInTransaction(ctx, tx, { taskIds, reason, cause }) {
      const tasks = taskRepository(tx);
      for (const task of await tasks.lockByIds(taskIds)) {
        if (task.status === "done" || task.status === "cancelled") continue;
        const saved = await tasks.saveStatus(
          task.cancel(requireText(reason, "reason"), new Date()),
        );
        await appendStatusChange(ctx, tx, task, saved, cause);
      }
    },

    async lockInTransaction(tx, taskIds) {
      await taskRepository(tx).lockByIds(taskIds);
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

    async issueDecisionToken(ctx, taskId) {
      const id = parseUuid(taskId);
      const visible = requireVisible(ctx, id ? await taskRepository(orm).findById(id) : null);
      return issueDecisionToken(orm, ctx, visible);
    },

    async markDone(ctx, taskId, { result = null, decisionToken = null } = {}) {
      const done = await transact(async (tx) => {
        const { task, employeeId } = await lockVisible(ctx, tx, taskId);
        // An agent decides only through a card a person pressed.
        if (ctx.agentConnection) {
          await redeemDecisionToken(tx, ctx, { taskId: task.id, token: decisionToken });
        }
        const saved = await taskRepository(tx).saveStatus(
          task.markDone(employeeId, new Date(), result),
        );
        return { task: saved, historyLine: await appendStatusChange(ctx, tx, task, saved) };
      });
      logger.info(
        {
          taskId: done.task.id,
          type: done.task.type,
          resultCode: done.task.result?.code ?? null,
          agentConnectionId: ctx.agentConnection?.id ?? null,
        },
        "Task marked done",
      );
      return done;
    },

    async deleteTask(ctx, taskId) {
      const deleted = await transact(async (tx) => {
        const { task, employeeId } = await lockVisible(ctx, tx, taskId);
        task.requireDeletableBy(employeeId);
        await taskRepository(tx).delete(task.id);
        await history.append(ctx, tx, {
          recordType: "task",
          operation: "DELETED",
          cause: DIRECT_EDIT,
          records: [
            {
              recordId: task.id,
              changes: [
                { field: "title", oldValue: task.title, newValue: null },
                { field: "status", oldValue: task.status, newValue: null },
              ],
            },
          ],
        });
        return task;
      });
      logger.info({ taskId: deleted.id, type: deleted.type }, "Task deleted");
      return { deletedTaskId: deleted.id };
    },

    async lockTasks(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await taskRepository(tx).lockAll();
    },

    async resetTasks(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      await history.purge(tx, "task");
    },
  };
}

/** The task, locked in `tx` so the first change wins, if the caller holds or asked for it. */
async function lockVisible(
  ctx: SecurityContext,
  tx: Tx,
  taskId: string,
): Promise<{ task: Task; employeeId: string }> {
  const id = parseUuid(taskId);
  return requireVisible(ctx, id ? await taskRepository(tx).lockById(id) : null);
}

/** Appends the status change to the task's history and publishes it. */
async function appendStatusChange(
  ctx: SecurityContext,
  tx: Tx,
  before: Task,
  after: Task,
  cause: TaskCause = DIRECT_EDIT,
): Promise<HistoryLine> {
  tx.publish("tasks.task_status_changed", {
    taskId: after.id,
    from: before.status,
    to: after.status,
    byEmployeeId: ctx.user?.employeeId ?? null,
    result: after.result,
  });
  const [line] = await history.append(ctx, tx, {
    recordType: "task",
    operation: "UPDATED",
    cause,
    reason: after.result ? resultText(after.resultForm!, after.result) : after.cancelReason,
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
  if (task === null || employeeId === null || !task.isVisibleTo(employeeId)) {
    throw notFound();
  }
  return { task, employeeId };
}

function notFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No task has this id.");
}

const history = createRecordHistoryService();
