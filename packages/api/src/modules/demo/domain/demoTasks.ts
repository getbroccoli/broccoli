import type { TaskResultForm } from "../../../core/tasks";
import { addDays, type CalendarDate } from "../../../utils";
import { emailOf } from "./demoPeople";

/** A task one demo person asked of another, so My tasks shows each group. */
export interface DemoTask {
  title: string;
  description: string | null;
  assigneeEmail: string;
  askedByEmail: string;
  dueDate: CalendarDate | null;
  /** What the assignee answers when marking it done, so the demo shows both displays. */
  resultForm: TaskResultForm | null;
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

const DEMO_TASKS: readonly DemoTaskDefinition[] = [
  {
    title: "Approve the hiring plan for next quarter",
    description: "Two engineers and a designer; the budget is in the board pack.",
    assignee: "Oliver Bennett",
    askedBy: "Priya Shah",
    dueInDays: 3,
    resultForm: {
      kind: "choice",
      display: "buttons",
      options: [
        { code: "approve", label: "Approve", commentRequired: false },
        { code: "decline", label: "Decline", commentRequired: true },
      ],
    },
  },
  {
    title: "Sign James Whitfield's new contract",
    description: null,
    assignee: "Oliver Bennett",
    askedBy: "Priya Shah",
    dueInDays: -2,
    resultForm: null,
  },
  {
    title: "Agree the updated expenses policy",
    description: "The finance review is done; it needs agreeing before month end.",
    assignee: "James Whitfield",
    askedBy: "Oliver Bennett",
    dueInDays: null,
    resultForm: null,
  },
  {
    title: "Check the laptop budget for new starters",
    description: null,
    assignee: "Priya Shah",
    askedBy: "Oliver Bennett",
    dueInDays: 5,
    resultForm: null,
  },
  {
    title: "Choose the venue for the summer party",
    description: "Four places can take all of us on the last Friday of June.",
    assignee: "Oliver Bennett",
    askedBy: "James Whitfield",
    dueInDays: 7,
    resultForm: {
      kind: "choice",
      display: "choices",
      options: [
        { code: "riverside_terrace", label: "Riverside terrace", commentRequired: false },
        { code: "rooftop_bar", label: "Rooftop bar", commentRequired: false },
        { code: "office_garden", label: "Office garden", commentRequired: false },
        { code: "somewhere_else", label: "Somewhere else", commentRequired: true },
      ],
    },
  },
];

/** A demo task as written, by people's names and a due date relative to today. */
interface DemoTaskDefinition extends Omit<DemoTask, "assigneeEmail" | "askedByEmail" | "dueDate"> {
  assignee: string;
  askedBy: string;
  dueInDays: number | null;
}
