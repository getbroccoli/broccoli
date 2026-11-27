import { onTestFinished, vi } from "vitest";

import type { ApprovalProcessKey } from "../../src/core/approvals";
import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTimeOffRequestService, timeOffRecordType } from "../../src/modules/timeOff";
import { STANDARD_TIME_OFF_TYPES } from "../../src/modules/timeOff/domain";
import { bankHolidayService } from "./bankHolidayService";
import { calendarDate } from "./calendarDate";
import { mcpAgentToolService } from "./mcpAgentToolService";
import { approvalService, processService, transactWithApprovals } from "./processService";
import { taskService } from "./services";
import { signedIn } from "./signedIn";
import { ADMIN } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";
import {
  bookTimeOffService,
  giveDefaultTermsStatutoryMinimum,
  readTermsPolicies,
  timeOffService,
} from "./timeOffService";

/** A requester with 20 days, their manager, and the same before-commit handlers as the API. */
export async function leaveRequestSetup(
  orm: Orm,
  seed: TestSeed,
  { today: day = "2026-11-26" } = {},
) {
  const today = () => calendarDate(day);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const recordTypes = { time_off: timeOffRecordType(orm) };
  const transact: Transact = transactWithApprovals(orm, { today, recordTypes }, (tx, events) =>
    requests.finishApprovals(tx, events),
  );
  const approvals = approvalService(orm, { today, transact, recordTypes });
  const timeOff = timeOffService(orm, { today: today() });
  const tasks = taskService(orm, { transact });
  const requests = createTimeOffRequestService({
    orm,
    transact,
    approvals,
    today,
    timeOff,
    logger: createLogger("silent"),
    bankHolidays: bankHolidayService(),
  });
  const amira = await seed.employee({
    firstName: "Amira",
    lastName: "Hassan",
    startDate: "2025-01-01",
  });
  const rachel = await seed.employee({ firstName: "Rachel", lastName: "Doyle" });
  await seed.manager(amira.id, rachel.id);
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const [annual] = await readTermsPolicies(orm, await seed.defaultTermsId());
  const ownInput = {
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" as const }],
    note: "Visiting my family.",
  };
  return {
    ownInput,
    input: { ...ownInput, employeeId: amira.id },
    changeAnnualLeaveApproval: (approvalProcessKey: ApprovalProcessKey | null) =>
      timeOffService(orm).changeType(ADMIN, {
        ...STANDARD_TIME_OFF_TYPES.annual_leave,
        id: annual!.timeOffTypeId,
        approvalProcessKey,
      }),
    managerId: rachel.id,
    requester: signedIn(orm, { employeeId: amira.id, profiles: ["EMPLOYEE"] }),
    manager: signedIn(orm, { employeeId: rachel.id, profiles: ["EMPLOYEE"] }),
    requests,
    bookings: bookTimeOffService(orm, { today: today(), transact, approvals }),
    tasks,
    timeOff,
    agentTools: mcpAgentToolService(orm, { transact, today, timeOff, tasks, approvals }),
    managerAgent: signedIn(orm, {
      employeeId: rachel.id,
      profiles: ["EMPLOYEE"],
      agentConnection: { id: "rachel-agent", scopes: ["broccoli:read", "broccoli:write"] },
    }),
    requesterAgent: signedIn(orm, {
      employeeId: amira.id,
      profiles: ["EMPLOYEE"],
      agentConnection: { id: "amira-agent", scopes: ["broccoli:read", "broccoli:write"] },
    }),
    processes: processService(orm, { today, transact, recordTypes }),
  };
}

/** A waiting request and its manager’s open approval task. `today` sets the fixture clock. */
export async function pendingRequest(
  orm: Orm,
  seed: TestSeed,
  options?: { startDate: string; endDate: string; today?: string },
) {
  const setup = await leaveRequestSetup(orm, seed, { today: options?.today });
  const input = options
    ? { ...setup.input, startDate: options.startDate, endDate: options.endDate, halfDays: [] }
    : setup.input;
  const request = await setup.requests.requestTimeOff(setup.requester, input);
  const [task] = (await setup.tasks.listMyTasks(setup.manager)).needsYou;
  return { ...setup, input, request, task: task! };
}
