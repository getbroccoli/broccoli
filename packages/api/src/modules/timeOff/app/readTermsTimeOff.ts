import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import { earliestChangeDate } from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import type { PolicyVersion, TimeOffType } from "../domain";
import { byTypeOrder } from "./readTimeOffTypes";

/** A time off type on one set of terms: its rules from today on, and any unpublished ones. */
export interface TimeOffWithPolicies {
  termsId: string;
  timeOffType: TimeOffType;
  /** The terms' assignments covering today or later, oldest first, with their versions; none: not offered. */
  versions: TermsTimeOffRules[];
  /** The terms' unpublished rules for the type; null when there are none. */
  unpublished: PolicyVersion | null;
  /** The earliest date a change may apply from: the start of the current leave year. */
  earliestChange: CalendarDate;
}

/** A version given to terms for one type from a date to a date. */
export type TermsTimeOffRules = PolicyAssignment & { version: PolicyVersion };

type Dependencies = { orm: Orm; today: () => CalendarDate };

/** For each terms id: every time off type in list order with the terms' rules from today on. */
export async function readTermsTimeOff(
  { orm, today }: Dependencies,
  ctx: SecurityContext,
  termsIds: readonly string[],
): Promise<Map<string, TimeOffWithPolicies[]>> {
  ctx.require("MANAGE_WORKSPACE");
  const repository = timeOffPolicyRepository(orm);
  const types = (await repository.findAllTypes()).sort(byTypeOrder);
  const versions = (await repository.findAll()).flatMap((policy) =>
    policy.versions.map((version) => ({ ...version, timeOffTypeId: policy.timeOffType.id })),
  );
  const assignments = await repository.findAssignments({ termsIds });
  const date = today();
  return new Map(
    termsIds.map((termsId) => [
      termsId,
      types.map((timeOffType) => ({
        termsId,
        timeOffType,
        versions: assignments
          .filter(
            (row) =>
              "termsId" in row.owner &&
              row.owner.termsId === termsId &&
              row.timeOffTypeId === timeOffType.id &&
              (row.endDate === null || row.endDate >= date),
          )
          .map((row) => ({ ...row, version: versions.find(({ id }) => id === row.versionId)! })),
        unpublished:
          versions.find(
            (version) =>
              version.status === "draft" &&
              version.termsId === termsId &&
              version.timeOffTypeId === timeOffType.id,
          ) ?? null,
        earliestChange: earliestChangeDate(date),
      })),
    ]),
  );
}
