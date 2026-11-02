import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import { policyGroupRepository, workingPatternRepository } from "../db";
import { coversDate, type DatedPolicy, makeRoomForDatedPolicy, parseDateField } from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { referencedPolicy } from "./workingPatternPolicyService";

/** The working pattern policy each group's members work by default, from a date. Admins only. */
export interface GroupWorkingPatternService {
  /** Puts a group on a policy from a date; its earlier policy ends the day before. Admins only. */
  setGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; policyId: string; effectiveFrom: string },
  ) => Promise<void>;
  /** Ends the group's policy on a date; the group then has none. Admins only. */
  endGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveUntil: string },
  ) => Promise<void>;
  /** Removes the group's policy that starts on a date, null for from the beginning. Admins only. */
  removeGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveFrom: string | null },
  ) => Promise<void>;
}

export function createGroupWorkingPatternService({
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): GroupWorkingPatternService {
  return {
    async setGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      await changeGroupPatterns(
        { transact, logger },
        input.policyGroupId,
        effectiveFrom,
        async (tx, groupId, rows) => {
          const patterns = workingPatternRepository(tx);
          const policy = referencedPolicy(await patterns.findPolicies(), input.policyId);
          // A correction on a link's own date keeps that link's end, so a later link stays.
          const until =
            rows.find((row) => row.effectiveFrom === effectiveFrom)?.effectiveUntil ?? null;
          const { ended, replaced } = makeRoomForDatedPolicy(rows, effectiveFrom, until);
          if (replaced) {
            await patterns.deleteGroupPolicy(replaced.id);
          }
          if (ended) {
            await patterns.endGroupPolicy(ended.id, addDays(effectiveFrom, -1));
          }
          await patterns.insertGroupPolicy(groupId, {
            policyId: policy.id,
            effectiveFrom,
            effectiveUntil: until,
          });
        },
      );
    },

    async endGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveUntil = parseDateField("effectiveUntil", input.effectiveUntil);
      const changedFrom = addDays(effectiveUntil, 1);
      await changeGroupPatterns(
        { transact, logger },
        input.policyGroupId,
        changedFrom,
        async (tx, _groupId, rows) => {
          const row = rows.find((candidate) => coversDate(candidate, effectiveUntil));
          if (!row) {
            throw noGroupPattern();
          }
          await workingPatternRepository(tx).endGroupPolicy(row.id, effectiveUntil);
        },
      );
    },

    async removeGroupPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom =
        input.effectiveFrom === null ? null : parseDateField("effectiveFrom", input.effectiveFrom);
      await changeGroupPatterns(
        { transact, logger },
        input.policyGroupId,
        effectiveFrom,
        async (tx, _groupId, rows) => {
          const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
          if (!row) {
            throw noGroupPattern();
          }
          await workingPatternRepository(tx).deleteGroupPolicy(row.id);
        },
      );
    },
  };
}

/**
 * Changes one group's dated policies in one transaction and tells other modules its members'
 * working weeks may have changed from `changedFrom`.
 */
async function changeGroupPatterns(
  { transact, logger }: { transact: Transact; logger: Logger },
  policyGroupId: string,
  changedFrom: CalendarDate | null,
  change: (tx: Tx, groupId: string, rows: DatedPolicy[]) => Promise<void>,
): Promise<void> {
  const groupId = await transact(async (tx) => {
    const patterns = workingPatternRepository(tx);
    await patterns.lockForWrites();
    const id = await existingGroup(tx, policyGroupId);
    await change(tx, id, (await patterns.findGroupPolicies([id])).get(id) ?? []);
    const members = await policyGroupRepository(tx).findMemberIds(id);
    publishWorkingPatternChange(tx, members, changedFrom);
    return id;
  });
  logger.info({ policyGroupId: groupId, changedFrom }, "Changed a group's working pattern");
}

async function existingGroup(tx: Tx, policyGroupId: string): Promise<string> {
  const id = parseUuid(policyGroupId);
  if (!id || !(await policyGroupRepository(tx).exists(id))) {
    throw invalidInput([{ field: "policyGroupId", code: "not_found" }]);
  }
  return id;
}

function noGroupPattern(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The group has no working pattern on this date.");
}
