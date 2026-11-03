import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import { termsRepository, workingPatternRepository } from "../db";
import { coversDate, type DatedPattern, makeRoomForDatedPattern, parseDateField } from "../domain";
import { publishWorkingPatternChange } from "./publishWorkingPatternChange";
import { referencedPattern } from "./workingPatternService";

/** The working pattern the people on each terms work by default, from a date. Admins only. */
export interface TermsWorkingPatternService {
  /** Puts terms on a pattern from a date; their earlier pattern ends the day before. Admins only. */
  setTermsPattern: (
    ctx: SecurityContext,
    input: { termsId: string; workingPatternId: string; effectiveFrom: string },
  ) => Promise<void>;
  /** Ends the terms' pattern on a date; the terms then have none. Admins only. */
  endTermsPattern: (
    ctx: SecurityContext,
    input: { termsId: string; effectiveUntil: string },
  ) => Promise<void>;
  /** Removes the terms' pattern that starts on a date, null for from the beginning. Admins only. */
  removeTermsPattern: (
    ctx: SecurityContext,
    input: { termsId: string; effectiveFrom: string | null },
  ) => Promise<void>;
}

export function createTermsWorkingPatternService({
  transact,
  logger,
}: Pick<ModuleDependencies, "transact" | "logger">): TermsWorkingPatternService {
  return {
    async setTermsPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom = parseDateField("effectiveFrom", input.effectiveFrom);
      await changeTermsPatterns(
        { transact, logger },
        input.termsId,
        effectiveFrom,
        async (tx, termsId, rows) => {
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
            await repository.deleteTermsLink(replaced.id);
          }
          if (ended) {
            await repository.endTermsLink(ended.id, addDays(effectiveFrom, -1));
          }
          await repository.insertTermsLink(termsId, {
            workingPatternId: pattern.id,
            effectiveFrom,
            effectiveUntil: until,
          });
        },
      );
    },

    async endTermsPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveUntil = parseDateField("effectiveUntil", input.effectiveUntil);
      const changedFrom = addDays(effectiveUntil, 1);
      await changeTermsPatterns(
        { transact, logger },
        input.termsId,
        changedFrom,
        async (tx, _termsId, rows) => {
          const row = rows.find((candidate) => coversDate(candidate, effectiveUntil));
          if (!row) {
            throw noTermsPattern();
          }
          await workingPatternRepository(tx).endTermsLink(row.id, effectiveUntil);
        },
      );
    },

    async removeTermsPattern(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const effectiveFrom =
        input.effectiveFrom === null ? null : parseDateField("effectiveFrom", input.effectiveFrom);
      await changeTermsPatterns(
        { transact, logger },
        input.termsId,
        effectiveFrom,
        async (tx, _termsId, rows) => {
          const row = rows.find((candidate) => candidate.effectiveFrom === effectiveFrom);
          if (!row) {
            throw noTermsPattern();
          }
          await workingPatternRepository(tx).deleteTermsLink(row.id);
        },
      );
    },
  };
}

/**
 * Changes one terms' dated patterns in one transaction and tells other modules their people's
 * working weeks may have changed from `changedFrom`.
 */
async function changeTermsPatterns(
  { transact, logger }: { transact: Transact; logger: Logger },
  termsId: string,
  changedFrom: CalendarDate | null,
  change: (tx: Tx, termsId: string, rows: DatedPattern[]) => Promise<void>,
): Promise<void> {
  const changedTermsId = await transact(async (tx) => {
    const repository = workingPatternRepository(tx);
    await repository.lockForWrites();
    const id = await existingTerms(tx, termsId);
    await change(tx, id, (await repository.findTermsLinks([id])).get(id) ?? []);
    const members = await termsRepository(tx).findMemberIds(id);
    publishWorkingPatternChange(tx, members, changedFrom);
    return id;
  });
  logger.info({ termsId: changedTermsId, changedFrom }, "Changed the working pattern of terms");
}

async function existingTerms(tx: Tx, termsId: string): Promise<string> {
  const id = parseUuid(termsId);
  if (!id || !(await termsRepository(tx).exists(id))) {
    throw invalidInput([{ field: "termsId", code: "not_found" }]);
  }
  return id;
}

function noTermsPattern(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The terms have no working pattern on this date.");
}
