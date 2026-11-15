import { addDays, type CalendarDate } from "../../../utils";
import { emailOf } from "./demoPeople";

/** A task one demo person asked of another, so My tasks shows each group. */
export interface DemoTask {
  title: string;
  description: string | null;
  assigneeEmail: string;
  askedByEmail: string;
  dueDate: CalendarDate | null;
}

/** The demo company's tasks, with due dates counted from `today`. */
export function demoTasks(today: CalendarDate): DemoTask[] {
  return DEMO_TASKS.map(({ assignee, askedBy, dueInDays, ...task }) => ({
    ...task,
    assigneeEmail: emailOf(assignee),
    askedByEmail: emailOf(askedBy),
    dueDate: dueInDays === null ? null : addDays(today, dueInDays),
  }));
}

const DEMO_TASKS = [
  {
    title: "Approve the hiring plan for next quarter",
    description: "Two engineers and a designer; the budget is in the board pack.",
    assignee: "Oliver Bennett",
    askedBy: "Priya Shah",
    dueInDays: 3,
  },
  {
    title: "Sign James Whitfield's new contract",
    description: null,
    assignee: "Oliver Bennett",
    askedBy: "Priya Shah",
    dueInDays: -2,
  },
  {
    title: "Agree the updated expenses policy",
    description: "The finance review is done; it needs agreeing before month end.",
    assignee: "James Whitfield",
    askedBy: "Oliver Bennett",
    dueInDays: null,
  },
  {
    title: "Check the laptop budget for new starters",
    description: null,
    assignee: "Priya Shah",
    askedBy: "Oliver Bennett",
    dueInDays: 5,
  },
] as const;
