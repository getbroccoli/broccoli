import type { TaskFieldsFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayOf, utcDay } from "@/lib/calendarDay";

export type TaskRow = TaskFieldsFragment;
type Person = NonNullable<TaskRow["requestedBy"]>;

/** "Tue 10 Nov", from a `YYYY-MM-DD` calendar date or an ISO date-time. */
export function formatTaskDay(value: string): string {
  const day = value.length === 10 ? value : calendarDayOf(new Date(value));
  return DAY_FORMAT.format(utcDay(day));
}

/**
 * The tasks to do the viewer holds, in whichever group the cache has them: a task reopened on this
 * page still sits under Resolved recently until Tasks next loads.
 */
export function countTasksNeedingYou(
  groups: { needsYou: TaskRow[]; waitingOnOthers: TaskRow[]; resolvedRecently: TaskRow[] },
  viewerId: string | null,
): number {
  return [...groups.needsYou, ...groups.waitingOnOthers, ...groups.resolvedRecently].filter(
    (task) => task.status === "TO_DO" && task.assignee.id === viewerId,
  ).length;
}

/** Whether a task still open was due before `today`. */
export function isLate(task: TaskRow, today: string): boolean {
  return isOpen(task) && task.dueDate !== null && task.dueDate < today;
}

export function isOpen(task: TaskRow): boolean {
  return task.status === "TO_DO" || task.status === "WAITING";
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
  if (task.status === "WAITING") return t("tasks.fact.waiting");
  if (task.assignee.id !== viewerId)
    return t("tasks.fact.heldBy", { name: personName(task.assignee) });
  return task.description ?? "";
}

/** "Due Fri 13 Nov" or "Late, was Fri 6 Nov", for a task with a due date. */
export function dueText(task: TaskRow, today: string): string {
  const date = formatTaskDay(task.dueDate!);
  return isLate(task, today) ? t("tasks.fact.late", { date }) : t("tasks.fact.due", { date });
}

/** Who a task comes from: the person who asked, or its process step. */
export function taskSource(task: TaskRow, viewerId: string | null): string {
  if (task.requestedBy) {
    return task.requestedBy.id === viewerId ? t("tasks.you") : personName(task.requestedBy);
  }
  const { processKey, stepKey } = task.processSource!;
  // shortcut: shows the keys, as no process creates tasks yet; name them with the first one that does.
  return `${processKey} · ${stepKey}`;
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
