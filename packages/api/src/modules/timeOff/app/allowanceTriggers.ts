import type { Transact } from "../../../core/db";
import type { EventHandlers } from "../../../core/events";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext } from "../../../core/security";
import type { EmploymentChanges } from "../../employees";
import type { AllowanceCause } from "../domain";
import type { EnsuredAllowances } from "./allowanceEngine";
import type { TimeOffService } from "./timeOffService";

/** One engine run, logged once it commits. */
export type AllowancesEnsured = EnsuredAllowances & {
  causeKind: AllowanceCause["kind"];
  employeeCount: number;
};

/** Ensures the allowances of people added or whose start date moved, in the same transaction. */
export function allowancesOnEmploymentChanges(
  timeOff: Pick<TimeOffService, "ensureAllowances">,
): EmploymentChanges {
  return {
    async afterEmploymentsChanged(ctx, tx, { employeeIds, cause }) {
      const ensured = await timeOff.ensureAllowances(ctx, tx, { employeeIds, cause });
      tx.publish("timeOff.allowances_ensured", {
        causeKind: cause.kind,
        employeeCount: employeeIds.length,
        ...ensured,
      });
    },
  };
}

/** What time off does when people's working weeks change, and logging its runs after commit. */
export function allowanceEventHandlers({
  timeOff,
  transact,
  logger,
}: {
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  transact: Transact;
  logger: Logger;
}): EventHandlers {
  return {
    async "employees.working_pattern_changed"({ employeeIds, from }) {
      const cause: AllowanceCause = { kind: "WORKING_PATTERN_CHANGED", ref: from };
      const log = { causeKind: cause.kind, employeeCount: employeeIds.length };
      try {
        const ensured = await transact((tx) =>
          timeOff.ensureAllowances(PrincipalSecurityContext.system(), tx, { employeeIds, cause }),
        );
        logger.info({ ...log, ...ensured }, "Ensured allowances");
      } catch (error) {
        // Logged here with what the run was for, not rethrown to the bus; the daily check repairs it.
        logger.error({ ...log, err: error }, "Could not ensure allowances");
      }
    },
    "timeOff.allowances_ensured": (ensured) => {
      logger.info(ensured, "Ensured allowances");
      return Promise.resolve();
    },
  };
}
