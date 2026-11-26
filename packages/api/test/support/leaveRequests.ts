import { onTestFinished, vi } from "vitest";

import type { ApprovalProcessKey } from "../../src/core/approvals";
import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTimeOffRequestService, timeOffRecordType } from "../../src/modules/timeOff";
import { STANDARD_TIME_OFF_TYPES } from "../../src/modules/timeOff/domain";
import { bankHolidayService } from "./bankHolidayService";
import { calendarDate } from "./calendarDate";
import { processService, transactWithApprovals } from "./processService";
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
export async function leaveRequestSetup(orm: Orm, seed: TestSeed) {
  const today = () => calendarDate("2026-11-26");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const recordTypes = { time_off: timeOffRecordType(orm) };
  const transact: Transact = transactWithApprovals(orm, { today, recordTypes }, (tx, events) =>
    requests.finishApprovals(tx, events),
  );
  const requests = createTimeOffRequestService({
    orm,
    transact,
    today,
    timeOff: timeOffService(orm, { today: today() }),
    logger: createLogger("silent"),
    bankHolidays: bankHolidayService(),
  });
  const amira = await seed.employee({ firstName: "Amira", startDate: "2025-01-01" });
  const rachel = await seed.employee({ firstName: "Rachel" });
  await seed.manager(amira.id, rachel.id);
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const [annual] = await readTermsPolicies(orm, await seed.defaultTermsId());
  return {
    input: {
      employeeId: amira.id,
      timeOffTypeId: annual!.timeOffTypeId,
      startDate: "2026-12-07",
      endDate: "2026-12-09",
      halfDays: [{ date: "2026-12-09", dayPart: "morning" as const }],
      note: "Visiting my family.",
    },
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
    bookings: bookTimeOffService(orm, { today: today(), transact }),
    tasks: taskService(orm, { transact }),
    processes: processService(orm, { today, transact, recordTypes }),
  };
}
