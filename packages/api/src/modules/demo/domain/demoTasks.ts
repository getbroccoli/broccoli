import { addDays, type CalendarDate } from "../../../utils";
import { emailOf } from "./demoPeople";

/** A task one demo person asked of another, so My tasks shows each group. */
export interface DemoTask {
  title: string;
  description: string | null;
  assigneeEmail: string;
  requestedByEmail: string;
  dueDate: CalendarDate | null;
  /** Shown as waiting on something else rather than to do. */
  isWaiting: boolean;
}

/** The demo company's tasks, with due dates counted from `today`. */
export function demoTasks(today: CalendarDate): DemoTask[] {
  return DEMO_TASKS.map(({ assignee, requestedBy, dueInDays, ...task }) => ({
    ...task,
    assigneeEmail: emailOf(assignee),
    requestedByEmail: emailOf(requestedBy),
    dueDate: dueInDays === null ? null : addDays(today, dueInDays),
  }));
}

const DEMO_TASKS = [
  {
    title: "Approve the hiring plan for next quarter",
    description: "Two engineers and a designer; the budget is in the board pack.",
    assignee: "Oliver Bennett",
    requestedBy: "Priya Shah",
    dueInDays: 3,
    isWaiting: false,
  },
  {
    title: "Sign James Whitfield's new contract",
    description: null,
    assignee: "Oliver Bennett",
    requestedBy: "Priya Shah",
    dueInDays: -2,
    isWaiting: false,
  },
  {
    title: "Agree the updated expenses policy",
    description: "Waiting for the finance review before it can be agreed.",
    assignee: "Oliver Bennett",
    requestedBy: "James Whitfield",
    dueInDays: null,
    isWaiting: true,
  },
  {
    title: "Check the laptop budget for new starters",
    description: null,
    assignee: "Priya Shah",
    requestedBy: "Oliver Bennett",
    dueInDays: 5,
    isWaiting: false,
  },
] as const;
