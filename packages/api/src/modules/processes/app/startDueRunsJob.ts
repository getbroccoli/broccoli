import type { JobHandlers } from "../../../core/jobs";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import type { ProcessService } from "./processService";

/**
 * Every day at 06:00 London time, as the system: starts the runs whose record date has come and
 * cancels runs that can no longer run. A missed day catches up within each trigger's days late.
 */
export function startDueRunsJob({
  processes,
  logger,
  today = todayInLondon,
}: {
  processes: ProcessService;
  logger: Logger;
  today?: () => CalendarDate;
}): JobHandlers {
  return {
    "processes.startDueRuns": {
      schedule: { cron: "0 6 * * *", timeZone: "Europe/London", payload: {} },
      // One run walks every due record and run in progress; an hour keeps it from running twice at once.
      expireInSeconds: 60 * 60,
      run: async () => {
        const totals = await processes.startDueRuns(PrincipalSecurityContext.system(), today());
        logger.info(totals, "Due process runs started");
      },
      onFailed: () => {
        logger.error("Due process runs not started: the daily run failed every attempt");
        return Promise.resolve();
      },
    },
  };
}
