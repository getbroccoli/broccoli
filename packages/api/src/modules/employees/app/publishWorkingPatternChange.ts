import type { Tx } from "../../../core/db";
import type { CalendarDate } from "../../../utils";

/** Tells other modules these employees' working weeks may have changed from `from`; none: no event. */
export function publishWorkingPatternChange(
  tx: Tx,
  employeeIds: readonly string[],
  from: CalendarDate | null,
) {
  if (employeeIds.length > 0) {
    tx.publish("employees.working_pattern_changed", { employeeIds: [...employeeIds], from });
  }
}
