import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { timeOffPolicyRepository } from "../db";
import type { PolicyVersion, TimeOffPolicy, TimeOffType } from "../domain";
import { byTypeOrder } from "./readTimeOffTypes";

/** A time off type with its policy versions; none means it is not offered. */
export interface TimeOffWithPolicies {
  termsId: string;
  timeOffType: TimeOffType;
  /** The terms' policy for the type with all its versions; null when they never had one. */
  policy: TimeOffPolicy | null;
  /** The terms' policy versions covering today or later, oldest first: today's, then planned ones. */
  versions: PolicyVersion[];
}

type Dependencies = { orm: Orm; today: () => CalendarDate };

/** For each terms id: every time off type in list order with the terms' versions from today on. */
export async function readTermsTimeOff(
  { orm, today }: Dependencies,
  ctx: SecurityContext,
  termsIds: readonly string[],
): Promise<Map<string, TimeOffWithPolicies[]>> {
  ctx.require("MANAGE_WORKSPACE");
  const repository = timeOffPolicyRepository(orm);
  const types = (await repository.findAllTypes()).sort(byTypeOrder);
  const policies = await repository.findAll();
  const date = today();
  return new Map(
    termsIds.map((termsId) => [
      termsId,
      types.map((timeOffType) => {
        const policy =
          policies.find(
            (policy) => policy.termsId === termsId && policy.timeOffType.id === timeOffType.id,
          ) ?? null;
        return {
          termsId,
          timeOffType,
          policy,
          versions: (policy?.versions ?? []).filter(
            ({ endDate }) => endDate === null || endDate >= date,
          ),
        };
      }),
    ]),
  );
}
