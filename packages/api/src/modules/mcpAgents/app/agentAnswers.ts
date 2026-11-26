import type { PermissionProfile } from "../../../core/security";
import { resultLabel, type Task } from "../../../core/tasks";
import type { BookingPreview, EmployeeTimeOffType, OwnTimeOffMode } from "../../timeOff";

/** What the MCP tools answer: the shapes agents read, and how Broccoli's records become them. */

export interface WhoAmI {
  email: string;
  permissionProfiles: PermissionProfile[];
  employee: Person | null;
  manager: Person | null;
  today: string;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
}

export interface PeoplePage {
  people: Person[];
  /** Pass as `after` for the next page; null on the last one. */
  nextCursor: string | null;
}

/** How asking for one's own time off of a type goes. */
export type WhenYouAsk = "BOOKED_STRAIGHT_AWAY" | "ASK_FOR_APPROVAL" | "NOT_ALLOWED";

export interface LeaveBalance {
  today: string;
  types: LeaveType[];
  /** Why there are no types, such as a caller without an employee; null otherwise. */
  reason: string | null;
}

export interface LeaveType {
  timeOffTypeId: string;
  name: string;
  whenYouAsk: WhenYouAsk;
  balance: "FROM_ALLOWANCE" | "UNLIMITED" | "NO_BALANCE";
  periodStart: string;
  periodEnd: string;
  entitlement: number | null;
  bankHolidays: number | null;
  used: number;
  waiting: number;
  remaining: number | null;
}

export interface LeaveInput {
  timeOffTypeId: string;
  startDate: string;
  endDate: string;
  halfDays?: { date: string; dayPart: "MORNING" | "AFTERNOON" }[];
}

export interface LeaveRequestInput extends LeaveInput {
  note?: string;
  /** The total the person was shown and agreed to. */
  expectedDays: number;
}

export interface LeavePreview {
  whenYouAsk: WhenYouAsk;
  days: { date: string; dayPart: "FULL_DAY" | "MORNING" | "AFTERNOON"; cost: number }[];
  totalDays: number;
  balances: {
    periodStart: string;
    periodEnd: string;
    remainingBefore: number | null;
    remainingAfter: number | null;
  }[];
  refusal: { reason: string; date: string | null } | null;
}

export interface LeaveRequestResult {
  /** `ENDED_WITH_NO_DECISION` when nobody could approve it, so it ended as it was saved. */
  outcome: "WAITING_FOR_APPROVAL" | "BOOKED" | "ENDED_WITH_NO_DECISION" | "REJECTED_BY_APPROVER";
  timeOffId: string;
  totalDays: number;
}

/** A task to decide on a card: its facts, its options and the card's one-time token. */
export interface ApprovalCardAnswer {
  card: ApprovalCard;
  /** For the card only; never shown to the model. */
  token: string;
  expiresAt: string;
}

export interface ApprovalCard {
  taskId: string;
  title: string;
  description: string | null;
  askedBy: string | null;
  dueOn: string | null;
  options: { code: string; label: string; commentRequired: boolean }[];
  link: string;
}

export interface ApprovalDecisionInput {
  taskId: string;
  cardToken: string;
  resultCode: string;
  comment?: string;
}

export interface DecidedTask {
  taskId: string;
  status: "DONE";
  result: { label: string; comment: string | null };
}

export interface AgentTasks {
  needsYou: AgentTask[];
  waitingOnOthers: AgentTask[];
  resolvedRecently: AgentTask[];
  reason: string | null;
}

export interface AgentTask {
  taskId: string;
  title: string;
  description: string | null;
  dueOn: string | null;
  status: "TO_DO" | "DONE" | "CANCELLED";
  askedBy: string | null;
  assignee: string | null;
  link: string;
  result: { label: string; comment: string | null } | null;
  cancelReason: string | null;
}

export const WHEN_YOU_ASK = {
  booked_straight_away: "BOOKED_STRAIGHT_AWAY",
  requested_with_approval: "ASK_FOR_APPROVAL",
  refused: "NOT_ALLOWED",
} as const satisfies Record<OwnTimeOffMode, WhenYouAsk>;

const BALANCES = {
  balance_from_allowance: "FROM_ALLOWANCE",
  unlimited_balance: "UNLIMITED",
  no_balance: "NO_BALANCE",
} as const satisfies Record<EmployeeTimeOffType["balance"], LeaveType["balance"]>;

const TASK_STATUSES = {
  to_do: "TO_DO",
  done: "DONE",
  cancelled: "CANCELLED",
} as const satisfies Record<Task["status"], AgentTask["status"]>;

export function bookingOf({ timeOffTypeId, startDate, endDate, halfDays }: LeaveInput) {
  return {
    timeOffTypeId,
    startDate,
    endDate,
    halfDays: (halfDays ?? []).map(({ date, dayPart }) => ({
      date,
      dayPart: dayPart === "MORNING" ? ("morning" as const) : ("afternoon" as const),
    })),
  };
}

export function leaveTypeOf(type: EmployeeTimeOffType, whenYouAsk: WhenYouAsk): LeaveType {
  return {
    timeOffTypeId: type.timeOffType.id,
    name: type.timeOffType.name,
    whenYouAsk,
    balance: BALANCES[type.balance],
    periodStart: type.periodStart,
    periodEnd: type.periodEnd,
    entitlement: type.entitlement,
    bankHolidays: type.bankHolidays,
    used: type.used,
    waiting: type.waiting,
    remaining: type.remaining,
  };
}

export function previewOf(preview: BookingPreview, whenYouAsk: WhenYouAsk): LeavePreview {
  return {
    whenYouAsk,
    days: preview.days.map(({ date, dayPart, cost }) => ({
      date,
      dayPart:
        dayPart === "full_day" ? "FULL_DAY" : dayPart === "morning" ? "MORNING" : "AFTERNOON",
      cost,
    })),
    totalDays: preview.cost,
    balances: preview.balances.map(
      ({ periodStart, periodEnd, remainingBefore, remainingAfter }) => ({
        periodStart,
        periodEnd,
        remainingBefore,
        remainingAfter,
      }),
    ),
    refusal: preview.refusal && { reason: preview.refusal.reason, date: preview.refusal.date },
  };
}

export function agentTaskOf(
  task: Task,
  { names, origin }: { names: ReadonlyMap<string, string>; origin: string },
): AgentTask {
  return {
    taskId: task.id,
    title: task.title,
    description: task.description,
    dueOn: task.dueDate,
    status: TASK_STATUSES[task.status],
    askedBy: task.askedByEmployeeId ? (names.get(task.askedByEmployeeId) ?? null) : null,
    assignee: names.get(task.assigneeEmployeeId) ?? null,
    link: `${origin}/tasks/${task.id}`,
    result:
      task.result && task.resultForm
        ? { label: resultLabel(task.resultForm, task.result.code), comment: task.result.comment }
        : null,
    cancelReason: task.cancelReason,
  };
}

/** What saving one's own time off ended in, from where it stood just after the save. */
export function requestOutcomeOf(
  status: "requested" | "approved" | "rejected" | "cancelled",
): LeaveRequestResult["outcome"] {
  return REQUEST_OUTCOMES[status];
}

const REQUEST_OUTCOMES = {
  requested: "WAITING_FOR_APPROVAL",
  approved: "BOOKED",
  // Decided between the save and its read.
  rejected: "REJECTED_BY_APPROVER",
  // An approval with nobody to decide it ends before the commit, cancelling the request.
  cancelled: "ENDED_WITH_NO_DECISION",
} as const;

/** The card for a task with a result form, which the caller already checked. */
export function approvalCardOf(
  task: Task,
  { names, origin }: { names: ReadonlyMap<string, string>; origin: string },
): ApprovalCard {
  return {
    taskId: task.id,
    title: task.title,
    description: task.description,
    askedBy: task.askedByEmployeeId ? (names.get(task.askedByEmployeeId) ?? null) : null,
    dueOn: task.dueDate,
    options: task.resultForm!.options.map(({ code, label, commentRequired }) => ({
      code,
      label,
      commentRequired,
    })),
    link: `${origin}/tasks/${task.id}`,
  };
}

/** A task an agent's card decided, as the card shows it. */
export function decidedTaskOf(task: Task): DecidedTask {
  return {
    taskId: task.id,
    status: "DONE",
    result: {
      label: resultLabel(task.resultForm!, task.result!.code),
      comment: task.result!.comment,
    },
  };
}
