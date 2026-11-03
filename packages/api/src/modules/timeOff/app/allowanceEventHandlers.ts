import type { Transact } from "../../../core/db";
import type { EventHandlers } from "../../../core/events";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext } from "../../../core/security";
import type { AllowanceCause } from "../domain";
import type { TimeOffService } from "./timeOffService";

interface AllowanceEventDependencies {
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  transact: Transact;
  logger: Logger;
}

/** Ensures allowances as the system after people are added or their start dates or working weeks change. */
export function allowanceEventHandlers(dependencies: AllowanceEventDependencies): EventHandlers {
  return {
    "employees.added": ({ employeeIds }) =>
      ensureAllowances(dependencies, employeeIds, { kind: "EMPLOYEE_ADDED", ref: null }),
    "employees.start_date_changed": ({ employeeId, startDate }) =>
      ensureAllowances(dependencies, [employeeId], { kind: "START_DATE_CHANGED", ref: startDate }),
    "employees.working_pattern_changed": ({ employeeIds, from }) =>
      ensureAllowances(dependencies, employeeIds, { kind: "WORKING_PATTERN_CHANGED", ref: from }),
  };
}

async function ensureAllowances(
  { timeOff, transact, logger }: AllowanceEventDependencies,
  employeeIds: readonly string[],
  cause: AllowanceCause,
): Promise<void> {
  const log = { causeKind: cause.kind, employeeCount: employeeIds.length };
  try {
    const ensured = await transact((tx) =>
      timeOff.ensureAllowances(PrincipalSecurityContext.system(), tx, { employeeIds, cause }),
    );
    logger.info({ ...log, ...ensured }, "Ensured allowances");
  } catch (error) {
    // The employee change already committed; include the run's cause in the failure log.
    logger.error({ ...log, err: error }, "Could not ensure allowances");
  }
}
