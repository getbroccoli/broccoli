import type { Orm, Transact } from "../../../core/db";
import type { JobHandlers } from "../../../core/jobs";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext } from "../../../core/security";
import { type CalendarDate, todayInLondon } from "../../../utils";
import { createEmployeeReadService } from "../../employees";
import type { AllowanceCause } from "../domain";
import type { TimeOffService } from "./timeOffService";

/**
 * Every day at 00:10 London time, ensures every employee's allowances as the system: it starts
 * the new leave year, repairs what a lost event missed and picks up changed bank holidays. A
 * failed batch is logged and left for the next run.
 */
export function ensureAllowancesJob({
  orm,
  transact,
  logger,
  timeOff,
  today = todayInLondon,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  timeOff: TimeOffService;
  today?: () => CalendarDate;
}): JobHandlers {
  const employeeReads = createEmployeeReadService({ orm });
  const system = PrincipalSecurityContext.system();
  return {
    "timeOff.ensureAllowances": {
      schedule: { cron: "10 0 * * *", timeZone: "Europe/London", payload: {} },
      run: async () => {
        const cause = causeOn(today());
        const totals = {
          employeeCount: 0,
          allowancesCreated: 0,
          linesAppended: 0,
          failedBatches: 0,
        };
        let after: string | null = null;
        let hasNextPage = true;
        while (hasNextPage) {
          const page = await employeeReads.listEmployees(system, { first: BATCH_SIZE, after });
          const employeeIds = page.edges.map(({ node }) => node.id);
          try {
            const ensured = await transact((tx) =>
              timeOff.ensureAllowances(system, tx, { employeeIds, cause }),
            );
            totals.allowancesCreated += ensured.allowancesCreated;
            totals.linesAppended += ensured.linesAppended;
          } catch (error) {
            totals.failedBatches += 1;
            logger.error(
              {
                causeKind: cause.kind,
                employeeCount: employeeIds.length,
                firstEmployeeId: employeeIds[0],
                kind: (error as Error | undefined)?.constructor?.name,
              },
              "Allowance batch failed",
            );
          }
          totals.employeeCount += employeeIds.length;
          ({ endCursor: after, hasNextPage } = page.pageInfo);
        }
        logger.info({ causeKind: cause.kind, ...totals }, "Allowances ensured for every employee");
      },
      onFailed: () => {
        logger.error("Allowances not ensured: the daily run failed every attempt");
        return Promise.resolve();
      },
    },
  };
}

const BATCH_SIZE = 100;

/** Shortcut: every standard policy's leave year starts on 1 January; an anniversary year reads as a daily check. */
function causeOn(date: CalendarDate): AllowanceCause {
  return { kind: date.endsWith("-01-01") ? "LEAVE_YEAR_STARTED" : "DAILY_CHECK", ref: date };
}
