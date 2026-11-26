import Big from "big.js";

import { ApplicationError, type FieldError, invalidInput } from "../../../core/applicationError";
import type { Transact } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { authorOf } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import { type Allowance, allowanceRepository } from "../db";
import { type AllowanceChange, allowanceHistory } from "../domain";
import type { EmployeeTimeOffType } from "./readTimeOffTypes";
import type { TimeOffService } from "./timeOffService";

/** A balance's history, and the adjustments admins make to it. */
export interface AllowanceService {
  /**
   * Each allowance's changes, newest first, by allowance id; allowances whose person is outside
   * the caller's time off read scope are left out.
   */
  readAllowanceHistory(
    ctx: SecurityContext,
    input: { allowanceIds: readonly string[] },
  ): Promise<Map<string, AllowanceChange[]>>;
  /**
   * Adds days to or takes days from the person's current balance with a comment everyone who
   * reads it sees; returns the person's figures for that type. Admins only.
   */
  adjustAllowance(ctx: SecurityContext, input: AdjustmentInput): Promise<EmployeeTimeOffType>;
}

export interface AdjustmentInput {
  allowanceId: string;
  /** Days to add (positive) or take (negative). */
  amount: number;
  comment: string;
}

/** The most an adjustment changes a balance by: a leap year's days. */
const MAX_ADJUSTMENT_DAYS = 366;
/** The booking note's limit, for the same kind of free text. */
const MAX_COMMENT_LENGTH = 1_000;

export function createAllowanceService({
  transact,
  logger,
  timeOff,
  today = todayInLondon,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  timeOff: Pick<TimeOffService, "readTimeOffTypes">;
  today?: () => CalendarDate;
}): AllowanceService {
  return {
    async readAllowanceHistory(ctx, { allowanceIds }) {
      const ids = allowanceIds.flatMap((id) => parseUuid(id) ?? []);
      const scope = await ctx.recordScope("time_off", "read");
      return transact(async (tx) => {
        const repository = allowanceRepository(tx);
        const readable = (await repository.findByIds(ids)).filter(({ employeeId }) =>
          isInRecordScope(scope, employeeId),
        );
        const lines = await repository.findLines(readable.map(({ id }) => id));
        return new Map(readable.map(({ id }) => [id, allowanceHistory(lines.get(id) ?? [])]));
      });
    },

    async adjustAllowance(ctx, input) {
      const allowance = await findAllowance(transact, input.allowanceId);
      await ctx.requireInScope("time_off", "update", allowance.employeeId);
      const adjustment = parseAdjustment(input);
      const date = today();
      if (date > allowance.leaveYearEnd) {
        throw new ApplicationError("CONFLICT", "This leave year has ended.");
      }
      if (!(await currentBalanceOf(timeOff, ctx, allowance))) {
        throw invalidInput([{ field: "allowanceId", code: "invalid" }]);
      }
      const lineId = await transact((tx) =>
        allowanceRepository(tx).insertAdjustment({
          allowanceId: allowance.id,
          amount: adjustment.amount,
          // The adjustment counts for the card's leave year, which may start after today.
          effectiveDate: date < allowance.leaveYearStart ? allowance.leaveYearStart : date,
          reason: adjustment.comment,
          author: authorOf(ctx),
        }),
      );
      logger.info(
        {
          allowanceId: allowance.id,
          employeeId: allowance.employeeId,
          timeOffTypeId: allowance.timeOffTypeId,
          amount: adjustment.amount,
          lineId,
        },
        "Adjusted allowance",
      );
      return (await currentBalanceOf(timeOff, ctx, allowance))!;
    },
  };
}

async function findAllowance(transact: Transact, id: string): Promise<Allowance> {
  const parsed = parseUuid(id);
  const [allowance] = parsed
    ? await transact((tx) => allowanceRepository(tx).findByIds([parsed]))
    : [];
  if (!allowance) {
    throw new ApplicationError("NOT_FOUND", "No allowance has this id.");
  }
  return allowance;
}

/** The figures of the balance the person's card shows today, if it is this allowance. */
async function currentBalanceOf(
  timeOff: Pick<TimeOffService, "readTimeOffTypes">,
  ctx: SecurityContext,
  allowance: Allowance,
): Promise<EmployeeTimeOffType | undefined> {
  const types = await timeOff.readTimeOffTypes(ctx, { employeeIds: [allowance.employeeId] });
  return types.get(allowance.employeeId)?.find(({ allowanceId }) => allowanceId === allowance.id);
}

/** The amount as decimal text and the trimmed comment; refuses either when it is invalid. */
function parseAdjustment({ amount, comment }: AdjustmentInput): {
  amount: string;
  comment: string;
} {
  const errors: FieldError[] = [];
  const days = Number.isFinite(amount) ? Big(amount) : null;
  if (days === null || days.eq(0) || !days.round(2).eq(days)) {
    errors.push({ field: "amount", code: "invalid" });
  } else if (days.abs().gt(MAX_ADJUSTMENT_DAYS)) {
    errors.push({ field: "amount", code: "out_of_range" });
  }
  const trimmed = comment.trim();
  if (trimmed === "") {
    errors.push({ field: "comment", code: "required" });
  } else if (trimmed.length > MAX_COMMENT_LENGTH) {
    errors.push({ field: "comment", code: "too_long" });
  }
  if (errors.length > 0) {
    throw invalidInput(errors);
  }
  return { amount: days!.toString(), comment: trimmed };
}
