import { z } from "zod";

import type { AgentScope } from "../../../core/agentAccess";

/** The tools offered to a person's own agent: names, descriptions and the shapes of their answers. */

/** Longer than any name or email a person searches for. */
const MAX_SEARCH_LENGTH = 100;
/** As long as the booking dialog's note. */
const MAX_NOTE_LENGTH = 1_000;

/** Each tool an agent may call, with the scope its token must hold; nothing else is offered. */
export const MCP_AGENT_TOOLS: Record<string, { scope: AgentScope }> = {
  who_am_i: { scope: "broccoli:read" },
  find_people: { scope: "broccoli:read" },
  my_leave_balance: { scope: "broccoli:read" },
  preview_leave: { scope: "broccoli:read" },
  request_leave: { scope: "broccoli:write" },
  list_my_tasks: { scope: "broccoli:read" },
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD");

const LEAVE_INPUT = {
  timeOffTypeId: z.string().describe("From my_leave_balance."),
  startDate: DATE,
  endDate: DATE,
  halfDays: z
    .array(z.object({ date: DATE, dayPart: z.enum(["MORNING", "AFTERNOON"]) }))
    .optional()
    .describe("Days taken only in the morning or the afternoon; every other day is a full day."),
};

const WHEN_YOU_ASK = z.enum(["BOOKED_STRAIGHT_AWAY", "ASK_FOR_APPROVAL", "NOT_ALLOWED"]);

const AGENT_TASK = z.object({
  taskId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  dueOn: z.string().nullable(),
  status: z.enum(["TO_DO", "DONE", "CANCELLED"]),
  askedBy: z.string().nullable(),
  assignee: z.string().nullable(),
  link: z.string(),
  result: z.object({ label: z.string(), comment: z.string().nullable() }).nullable(),
  cancelReason: z.string().nullable(),
});

const PERSON = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  jobTitle: z.string().nullable(),
});

export const WHO_AM_I = {
  title: "Who am I",
  description:
    "The person you act for in Broccoli: their email, permission profiles, employee record, manager, and today's date in the UK.",
  outputSchema: {
    email: z.string(),
    permissionProfiles: z.array(z.string()),
    employee: PERSON.nullable(),
    manager: PERSON.nullable(),
    today: z.string(),
  },
  annotations: { readOnlyHint: true },
};

export const FIND_PEOPLE = {
  title: "Find people",
  description:
    "People in the company the person may see, sorted by name, 25 at a time. Search by name or email; pass nextCursor as after for the next page.",
  inputSchema: {
    search: z.string().max(MAX_SEARCH_LENGTH).optional(),
    after: z.string().optional(),
  },
  outputSchema: { people: z.array(PERSON), nextCursor: z.string().nullable() },
  annotations: { readOnlyHint: true },
};

export const MY_LEAVE_BALANCE = {
  title: "My leave balance",
  description:
    "The person's own time off types this leave year: days used, waiting for approval and remaining, and whether asking for each is booked straight away, needs approval or isn't allowed here.",
  outputSchema: {
    today: z.string(),
    types: z.array(
      z.object({
        timeOffTypeId: z.string(),
        name: z.string(),
        whenYouAsk: WHEN_YOU_ASK,
        balance: z.enum(["FROM_ALLOWANCE", "UNLIMITED", "NO_BALANCE"]),
        periodStart: z.string(),
        periodEnd: z.string(),
        entitlement: z.number().nullable(),
        bankHolidays: z.number().nullable(),
        used: z.number(),
        waiting: z.number(),
        remaining: z.number().nullable(),
      }),
    ),
    reason: z.string().nullable(),
  },
  annotations: { readOnlyHint: true },
};

export const PREVIEW_LEAVE = {
  title: "Preview leave",
  description:
    "What the person's own time off would cost, day by day (0 for days they don't work and bank holidays), and their balance before and after. Show it to the person before request_leave.",
  inputSchema: LEAVE_INPUT,
  outputSchema: {
    whenYouAsk: WHEN_YOU_ASK,
    days: z.array(
      z.object({
        date: z.string(),
        dayPart: z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]),
        cost: z.number(),
      }),
    ),
    totalDays: z.number(),
    balances: z.array(
      z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        remainingBefore: z.number().nullable(),
        remainingAfter: z.number().nullable(),
      }),
    ),
    refusal: z.object({ reason: z.string(), date: z.string().nullable() }).nullable(),
  },
  annotations: { readOnlyHint: true },
};

export const REQUEST_LEAVE = {
  title: "Request leave",
  description:
    "Asks for the person's own time off, or books it when they may book it straight away. Only after the person confirmed the preview: pass its totalDays as expectedDays; a different cost is refused.",
  inputSchema: {
    ...LEAVE_INPUT,
    note: z
      .string()
      .max(MAX_NOTE_LENGTH)
      .optional()
      .describe("Saved with the time off; whoever may read the person's time off sees it."),
    expectedDays: z.number().describe("The preview's totalDays the person agreed to."),
  },
  outputSchema: {
    outcome: z.enum([
      "WAITING_FOR_APPROVAL",
      "BOOKED",
      "ENDED_WITH_NO_DECISION",
      "REJECTED_BY_APPROVER",
    ]),
    timeOffId: z.string(),
    totalDays: z.number(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
};

export const LIST_MY_TASKS = {
  title: "List my tasks",
  description:
    "The person's tasks: what needs them, what waits on others, and what was resolved recently, each with its link in Broccoli. You can't approve, reject or complete tasks: send the person to the link.",
  outputSchema: {
    needsYou: z.array(AGENT_TASK),
    waitingOnOthers: z.array(AGENT_TASK),
    resolvedRecently: z.array(AGENT_TASK),
    reason: z.string().nullable(),
  },
  annotations: { readOnlyHint: true },
};
