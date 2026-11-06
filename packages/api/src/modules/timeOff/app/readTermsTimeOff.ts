import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { timeOffPolicyRepository } from "../db";
import type { PolicyVersion, TimeOffType } from "../domain";
import { byTypeOrder } from "./readTimeOffTypes";

/** A time off type as one set of terms gives it: no versions means not offered there. */
export interface TermsTimeOff {
  timeOffType: TimeOffType;
  /** The terms' policy versions covering today or later, oldest first: today's, then planned ones. */
  versions: PolicyVersion[];
}

type Dependencies = { orm: Orm; today: () => CalendarDate };

/** For each terms id: every time off type in list order with the terms' versions from today on. */
export async function readTermsTimeOff(
  { orm, today }: Dependencies,
  ctx: SecurityContext,
  termsIds: readonly string[],
): Promise<Map<string, TermsTimeOff[]>> {
  ctx.require("MANAGE_WORKSPACE");
  const repository = timeOffPolicyRepository(orm);
  const types = (await repository.findAllTypes()).sort(byTypeOrder);
  const policies = await repository.findAll();
  const date = today();
  return new Map(
    termsIds.map((termsId) => [
      termsId,
      types.map((timeOffType) => ({
        timeOffType,
        versions: (
          policies.find(
            (policy) => policy.termsId === termsId && policy.timeOffType.id === timeOffType.id,
          )?.versions ?? []
        ).filter(({ endDate }) => endDate === null || endDate >= date),
      })),
    ]),
  );
}
