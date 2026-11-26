import { ApplicationError } from "../../../core/applicationError";
import type { ApprovalService } from "../../../core/approvals";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import type { Task, TaskService } from "../../../core/tasks";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { BankHolidayService } from "../../bankHolidays";
import {
  createEmployeeManagerService,
  createEmployeeReadService,
  type EmployeeReadService,
} from "../../employees";
import {
  createBookTimeOffService,
  createTimeOffRequestService,
  type TimeOffService,
} from "../../timeOff";
import {
  type AgentTasks,
  approvalCardOf,
  type ApprovalCardAnswer,
  type ApprovalDecisionInput,
  type DecidedTask,
  decidedTaskOf,
  agentTaskOf,
  bookingOf,
  type LeaveBalance,
  type LeaveInput,
  type LeavePreview,
  type LeaveRequestInput,
  type LeaveRequestResult,
  leaveTypeOf,
  type PeoplePage,
  type Person,
  previewOf,
  requestOutcomeOf,
  WHEN_YOU_ASK,
  type WhoAmI,
} from "./agentAnswers";

/** What a person's own agent reads and does in Broccoli, as that person, through the MCP server. */
export interface McpAgentToolService {
  /** Who the caller is: their email, permission profiles, employee and manager today, and today's date. */
  whoAmI: (ctx: SecurityContext) => Promise<WhoAmI>;
  /** The people the caller may read, sorted by name, a page at a time, optionally searched. */
  findPeople: (
    ctx: SecurityContext,
    input: { search?: string; after?: string },
  ) => Promise<PeoplePage>;
  /** The caller's own time off types this leave year, with figures and how asking for each goes. */
  myLeaveBalance: (ctx: SecurityContext) => Promise<LeaveBalance>;
  /** What the caller's own time off would cost, day by day, and do to their balance. */
  previewLeave: (ctx: SecurityContext, input: LeaveInput) => Promise<LeavePreview>;
  /** Asks for, or books, the caller's own time off; refused unless it costs `expectedDays`. */
  requestLeave: (ctx: SecurityContext, input: LeaveRequestInput) => Promise<LeaveRequestResult>;
  /** The caller's tasks by where the ball is, each with its address in Broccoli at `origin`. */
  listMyTasks: (ctx: SecurityContext, input: { origin: string }) => Promise<AgentTasks>;
  /** A card to decide the caller's own task with a result form, and its one-time token. */
  showApproval: (
    ctx: SecurityContext,
    input: { taskId: string; origin: string },
  ) => Promise<ApprovalCardAnswer>;
  /** Decides the task with the result the person pressed on the card that carries `cardToken`. */
  decideApproval: (ctx: SecurityContext, input: ApprovalDecisionInput) => Promise<DecidedTask>;
}

/** A page an agent can show or reason over in one go. */
const PEOPLE_PER_PAGE = 25;

const NO_EMPLOYEE = "You have no employee record in Broccoli.";

export function createMcpAgentToolService({
  timeOff,
  bankHolidays,
  approvals,
  tasks,
  today = todayInLondon,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: TimeOffService;
  bankHolidays: BankHolidayService;
  approvals: Pick<ApprovalService, "requestApproval" | "cancelApproval">;
  tasks: Pick<TaskService, "listMyTasks" | "readTask" | "issueDecisionToken" | "markDone">;
  today?: () => CalendarDate;
}): McpAgentToolService {
  const employees = createEmployeeReadService(dependencies);
  const managers = createEmployeeManagerService(dependencies);
  const timeOffServices = { ...dependencies, timeOff, bankHolidays, approvals, today };
  const bookings = createBookTimeOffService(timeOffServices);
  const requests = createTimeOffRequestService(timeOffServices);
  const whenYouAsk = async (ctx: SecurityContext, typeIds: readonly string[]) =>
    new Map(
      [...(await requests.ownTimeOffModes(ctx, typeIds))].map(([id, mode]) => [
        id,
        WHEN_YOU_ASK[mode],
      ]),
    );
  return {
    async whoAmI(ctx) {
      const user = ctx.user!;
      const employee = await employees.readMyEmployee(ctx);
      const manager = employee
        ? (await managers.readManagers(ctx, [employee.id])).get(employee.id)
        : undefined;
      return {
        email: user.email,
        permissionProfiles: [...user.permissionProfiles],
        employee: employee && personOf(employee),
        manager: manager ? personOf(manager) : null,
        today: today(),
      };
    },
    async findPeople(ctx, { search, after }) {
      const page = await employees.listEmployees(ctx, {
        first: PEOPLE_PER_PAGE,
        after,
        filter: { search },
      });
      return {
        people: page.edges.map(({ node }) => personOf(node)),
        nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
      };
    },
    async myLeaveBalance(ctx) {
      const employeeId = ctx.user?.employeeId;
      if (!employeeId) {
        return { today: today(), types: [], reason: NO_EMPLOYEE };
      }
      const types =
        (await timeOff.readTimeOffTypes(ctx, { employeeIds: [employeeId] })).get(employeeId) ?? [];
      const asking = await whenYouAsk(
        ctx,
        types.map(({ timeOffType }) => timeOffType.id),
      );
      return {
        today: today(),
        types: types.map((type) => leaveTypeOf(type, asking.get(type.timeOffType.id)!)),
        reason: null,
      };
    },
    async previewLeave(ctx, input) {
      const employeeId = requireEmployee(ctx);
      const preview = await bookings.previewBooking(ctx, { ...bookingOf(input), employeeId });
      const asking = await whenYouAsk(ctx, [input.timeOffTypeId]);
      return previewOf(preview, asking.get(input.timeOffTypeId)!);
    },
    async requestLeave(ctx, { note, expectedDays, ...input }) {
      const saved = await requests.saveOwnTimeOff(ctx, {
        ...bookingOf(input),
        note: note ?? null,
        expectedDays,
      });
      return {
        outcome: requestOutcomeOf(saved.status),
        timeOffId: saved.id,
        totalDays: saved.cost,
      };
    },
    async listMyTasks(ctx, { origin }) {
      if (!ctx.user?.employeeId) {
        return { needsYou: [], waitingOnOthers: [], resolvedRecently: [], reason: NO_EMPLOYEE };
      }
      const mine = await tasks.listMyTasks(ctx);
      const names = await namesOf(employees, ctx, [
        ...mine.needsYou,
        ...mine.waitingOnOthers,
        ...mine.resolvedRecently,
      ]);
      const shown = (list: readonly Task[]) =>
        list.map((task) => agentTaskOf(task, { names, origin }));
      return {
        needsYou: shown(mine.needsYou),
        waitingOnOthers: shown(mine.waitingOnOthers),
        resolvedRecently: shown(mine.resolvedRecently),
        reason: null,
      };
    },
    async showApproval(ctx, { taskId, origin }) {
      const task = await tasks.readTask(ctx, taskId);
      const { token, expiresAt } = await tasks.issueDecisionToken(ctx, task.id);
      const names = await namesOf(employees, ctx, [task]);
      return {
        card: approvalCardOf(task, { names, origin }),
        token,
        expiresAt: expiresAt.toISOString(),
      };
    },
    async decideApproval(ctx, { taskId, cardToken, resultCode, comment }) {
      const { task } = await tasks.markDone(ctx, taskId, {
        result: { code: resultCode, comment: comment ?? null },
        decisionToken: cardToken,
      });
      return decidedTaskOf(task);
    },
  };
}

function requireEmployee(ctx: SecurityContext): string {
  const employeeId = ctx.user?.employeeId;
  if (!employeeId) {
    throw new ApplicationError("FORBIDDEN", NO_EMPLOYEE);
  }
  return employeeId;
}

/** Full names of everyone the tasks name whom the caller may read, by employee id. */
async function namesOf(
  employees: EmployeeReadService,
  ctx: SecurityContext,
  tasks: readonly Task[],
): Promise<Map<string, string>> {
  const ids = new Set(
    tasks.flatMap(({ assigneeEmployeeId, askedByEmployeeId }) =>
      askedByEmployeeId ? [assigneeEmployeeId, askedByEmployeeId] : [assigneeEmployeeId],
    ),
  );
  const found = await employees.readEmployees(ctx, [...ids]);
  return new Map(
    [...found].map(([id, { firstName, lastName }]) => [id, `${firstName} ${lastName}`]),
  );
}

function personOf({ id, firstName, lastName, email, jobTitle }: Person): Person {
  return { id, firstName, lastName, email, jobTitle };
}
