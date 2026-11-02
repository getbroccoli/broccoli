import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import { policyGroupRepository, workingPatternRepository } from "../db";
import { coversDate, type DatedPattern, makeRoomForDatedPattern, parseDateField } from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { referencedPattern } from "./workingPatternService";

/** The working pattern each group's members work by default, from a date. Admins only. */
export interface GroupWorkingPatternService {
  /** Puts a group on a pattern from a date; its earlier pattern ends the day before. Admins only. */
  setGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; workingPatternId: string; effectiveFrom: string },
  ) => Promise<void>;
  /** Ends the group's pattern on a date; the group then has none. Admins only. */
  endGroupPattern: (
    ctx: SecurityContext,
    input: { policyGroupId: string; effectiveUntil: string },
  ) => Promise<void>;
  /** Removes the group's pattern that starts on a date, null for from the beginning. Admins only. */
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
          const repository = workingPatternRepository(tx);
          const pattern = referencedPattern(
            await repository.findPatterns(),
            input.workingPatternId,
          );
          // A correction on a link's own date keeps that link's end, so a later link stays.
          const until =
            rows.find((row) => row.effectiveFrom === effectiveFrom)?.effectiveUntil ?? null;
          const { ended, replaced } = makeRoomForDatedPattern(rows, effectiveFrom, until);
          if (replaced) {
            await repository.deleteGroupLink(replaced.id);
          }
          if (ended) {
            await repository.endGroupLink(ended.id, addDays(effectiveFrom, -1));
          }
          await repository.insertGroupLink(groupId, {
            workingPatternId: pattern.id,
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
          await workingPatternRepository(tx).endGroupLink(row.id, effectiveUntil);
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
          await workingPatternRepository(tx).deleteGroupLink(row.id);
        },
      );
    },
  };
}

/**
 * Changes one group's dated patterns in one transaction and tells other modules its members'
 * working weeks may have changed from `changedFrom`.
 */
async function changeGroupPatterns(
  { transact, logger }: { transact: Transact; logger: Logger },
  policyGroupId: string,
  changedFrom: CalendarDate | null,
  change: (tx: Tx, groupId: string, rows: DatedPattern[]) => Promise<void>,
): Promise<void> {
  const groupId = await transact(async (tx) => {
    const repository = workingPatternRepository(tx);
    await repository.lockForWrites();
    const id = await existingGroup(tx, policyGroupId);
    await change(tx, id, (await repository.findGroupLinks([id])).get(id) ?? []);
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
