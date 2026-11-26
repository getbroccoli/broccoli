import type { TaskFieldsFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayOf, utcDay } from "@/lib/calendarDay";

export type TaskRow = TaskFieldsFragment;
type Person = NonNullable<TaskRow["askedBy"]>;

/** "Tue 10 Nov", from a `YYYY-MM-DD` calendar date or an ISO date-time. */
export function formatTaskDay(value: string): string {
  const day = value.length === 10 ? value : calendarDayOf(new Date(value));
  return DAY_FORMAT.format(utcDay(day));
}

/** The tasks to do the viewer holds: one marked done on this page stays listed until Tasks next loads. */
export function countTasksNeedingYou(
  groups: { needsYou: TaskRow[] },
  viewerId: string | null,
): number {
  return groups.needsYou.filter((task) => task.status === "TO_DO" && task.assignee.id === viewerId)
    .length;
}

/** Whether a task still open was due before `today`. */
export function isLate(task: TaskRow, today: string): boolean {
  return isOpen(task) && task.dueDate !== null && task.dueDate < today;
}

export function isOpen(task: TaskRow): boolean {
  return task.status === "TO_DO";
}

/** The one fact that decides a task, under its title; for your own to-do, what is asked, as Due has the date. */
export function taskFact(task: TaskRow, viewerId: string | null): string {
  if (task.status === "DONE") {
    const date = formatTaskDay(task.doneAt!);
    return task.doneBy?.id === viewerId
      ? t("tasks.fact.doneByYou", { date })
      : t("tasks.fact.doneBy", { name: personName(task.doneBy), date });
  }
  if (task.status === "CANCELLED") return t("tasks.fact.cancelled", { reason: task.cancelReason! });
  if (task.assignee.id !== viewerId)
    return t("tasks.fact.heldBy", { name: personName(task.assignee) });
  return task.description ?? "";
}

/** "Due Fri 13 Nov" or "Late, was Fri 6 Nov", for a task with a due date. */
export function dueText(task: TaskRow, today: string): string {
  const date = formatTaskDay(task.dueDate!);
  return isLate(task, today) ? t("tasks.fact.late", { date }) : t("tasks.fact.due", { date });
}

/** Who a task comes from: the person who asked, or its process. */
export function taskSource(task: TaskRow, viewerId: string | null): string {
  if (task.askedBy) {
    return task.askedBy.id === viewerId ? t("tasks.you") : personName(task.askedBy);
  }
  return task.processRun!.processName;
}

/** The line under a task's process run status: who decided, who holds the decision, or how far it is. */
export function processRunDetail(task: TaskRow, viewerId: string | null): string {
  const run = task.processRun!;
  if (run.outcome) {
    const date = formatTaskDay(run.outcome.decidedAt);
    const { decidedBy } = run.outcome;
    return decidedBy
      ? t("tasks.processRun.decidedBy", { name: personName(decidedBy), date })
      : t("tasks.processRun.endedOn", { date });
  }
  if (run.status === "IN_PROGRESS") return progressDetail(task, viewerId);
  const date = formatTaskDay(run.endedAt!);
  return run.status === "CANCELLED" && run.decidesOutcome
    ? t("tasks.processRun.cancelledUndecided", { date })
    : t("tasks.processRun.endedOn", { date });
}

/** "No — VPN login fails", or "Yes" without a comment. */
export function resultText({ label, comment }: NonNullable<TaskRow["result"]>): string {
  return comment === null ? label : `${label} — ${comment}`;
}

function progressDetail(task: TaskRow, viewerId: string | null): string {
  const run = task.processRun!;
  if (!run.decidesOutcome) {
    const counts = { done: String(run.doneSteps), total: String(run.totalSteps) };
    return t("tasks.processRun.steps", counts);
  }
  if (task.assignee.id === viewerId && isOpen(task)) return t("tasks.processRun.waitingForYou");
  return t("tasks.processRun.withAssignee", {
    name: personName(task.assignee),
    date: formatTaskDay(task.createdAt),
  });
}

export function personName(person: Person | null): string {
  return person ? `${person.firstName} ${person.lastName}` : "";
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
