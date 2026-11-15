import type { Task } from "./task";

/** How long a done or cancelled task stays in Resolved recently. */
export const RESOLVED_RECENTLY_DAYS = 14;

/** A person's tasks by where the ball is. */
export interface MyTasks {
  /** Tasks they hold to do: by due date, none last, then oldest first. */
  needsYou: Task[];
  /** Open tasks they asked someone else for, and their own waiting tasks; oldest first. */
  waitingOnOthers: Task[];
  /** Tasks they hold or asked for, done or cancelled lately; newest first. */
  resolvedRecently: Task[];
}

/** The earliest close a task may have to stay in Resolved recently. */
export function resolvedRecentlySince(now: Date): Date {
  return new Date(now.getTime() - RESOLVED_RECENTLY_DAYS * 24 * 60 * 60 * 1000);
}

/** Sorts the tasks a person holds or asked for, already narrowed to open and recently closed ones. */
export function groupMyTasks(tasks: readonly Task[], employeeId: string): MyTasks {
  const holds = (task: Task) => task.assigneeEmployeeId === employeeId;
  return {
    needsYou: tasks.filter((task) => holds(task) && task.status === "to_do").sort(byDueDate),
    waitingOnOthers: tasks
      .filter((task) => (holds(task) ? task.status === "waiting" : isOpen(task)))
      .sort(byCreation),
    resolvedRecently: tasks.filter((task) => !isOpen(task)).sort(byLatestClose),
  };
}

function isOpen(task: Task): boolean {
  return task.status === "to_do" || task.status === "waiting";
}

function byDueDate(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return byCreation(a, b);
}

function byCreation(a: Task, b: Task): number {
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function byLatestClose(a: Task, b: Task): number {
  return closedAt(b) - closedAt(a);
}

function closedAt(task: Task): number {
  return (task.doneAt ?? task.cancelledAt)!.getTime();
}
