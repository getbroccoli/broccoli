import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate } from "../../../utils";
import type { Employee } from "../../employees";
import { timeOffPolicyRepository } from "../db";
import { type PolicyVersion, stopValue, type TimeOffPolicy } from "../domain";
import { appendTermsHistory } from "./appendTermsHistory";
import type { TimeOffService } from "./timeOffService";

/** Makes the version a planned stop ends open-ended again; returns the policy. */
export async function cancelStop(
  ctx: SecurityContext,
  tx: Tx,
  {
    policy,
    stopped,
    reachOf,
    timeOff,
  }: {
    policy: TimeOffPolicy;
    stopped: PolicyVersion;
    reachOf: (tx: Tx, policy: TimeOffPolicy, from: CalendarDate) => Promise<Employee[]>;
    timeOff: Pick<TimeOffService, "ensureAllowances">;
  },
): Promise<TimeOffPolicy> {
  const stopDate = addDays(stopped.endDate!, 1);
  await timeOffPolicyRepository(tx).endVersion(stopped.id, null);
  await appendTermsHistory(ctx, tx, policy, stopValue(stopDate), null);
  const reopened = (await timeOffPolicyRepository(tx).findAll()).find(
    ({ id }) => id === policy.id,
  )!;
  await timeOff.ensureAllowances(ctx, tx, {
    employeeIds: (await reachOf(tx, reopened, stopDate)).map(({ id }) => id),
    cause: { kind: "TIME_OFF_RULES_CHANGED", ref: `${policy.id}:${stopDate}`, from: stopDate },
  });
  return reopened;
}
