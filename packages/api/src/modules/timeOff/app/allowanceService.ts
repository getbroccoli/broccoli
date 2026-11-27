import Big from "big.js";

import { ApplicationError, type FieldError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { authorOf, type HistoryAuthor } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import { createEmployeeReadService, type EmployeeReadService } from "../../employees";
import { type Allowance, allowanceRepository, timeOffPolicyRepository } from "../db";
import { type AllowanceChange, allowanceHistory } from "../domain";
import { type EmployeeTimeOffType, readTimeOffTypesInTransaction } from "./readTimeOffTypes";

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
  /**
   * Undoes one adjustment with a line of the opposite amount, keeping the adjustment in the
   * history; returns the person's figures for that type. Admins only.
   */
  reverseAdjustment(
    ctx: SecurityContext,
    input: { adjustmentId: string; comment?: string | null },
  ): Promise<EmployeeTimeOffType>;
}

export interface AdjustmentInput {
  allowanceId: string;
  /** Days to add (positive) or take (negative). */
  amount: number;
  comment: string;
  /** Made once per adjustment the admin means, so sending it again appends nothing. */
  requestId?: string | null;
}

export function createAllowanceService({
  orm,
  transact,
  logger,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  today?: () => CalendarDate;
}): AllowanceService {
  const reads: CardReads = { employeeReads: createEmployeeReadService({ orm }), today };
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
      const { card, lineId } = await transact((tx) =>
        appendAdjustment(reads, tx, { allowance, adjustment, author: authorOf(ctx) }),
      );
      logger.info(
        {
          allowanceId: allowance.id,
          employeeId: allowance.employeeId,
          timeOffTypeId: allowance.timeOffTypeId,
          amount: adjustment.amount,
          lineId,
          repeated: lineId === null,
        },
        "Adjusted allowance",
      );
      return card;
    },

    async reverseAdjustment(ctx, input) {
      const adjustment = await findAdjustment(transact, input.adjustmentId);
      const allowance = await findAllowance(transact, adjustment.allowanceId);
      await ctx.requireInScope("time_off", "update", allowance.employeeId);
      const reason = parseReversalComment(input.comment);
      const { card, lineId } = await transact((tx) =>
        appendToCurrentCard(reads, tx, allowance, async (effectiveDate) => {
          const reversalId = await allowanceRepository(tx).insertReversal({
            allowanceId: allowance.id,
            adjustmentId: adjustment.id,
            amount: Big(adjustment.amount).neg().toString(),
            effectiveDate,
            reason,
            author: authorOf(ctx),
          });
          if (reversalId === null) {
            throw new ApplicationError("CONFLICT", "This adjustment has been reversed already.");
          }
          return reversalId;
        }),
      );
      logger.info(
        {
          allowanceId: allowance.id,
          employeeId: allowance.employeeId,
          timeOffTypeId: allowance.timeOffTypeId,
          adjustmentId: adjustment.id,
          lineId,
        },
        "Reversed allowance adjustment",
      );
      return card;
    },
  };
}

/** What reading the person's cards needs, with the employee locks taken before them. */
type CardReads = Parameters<typeof readTimeOffTypesInTransaction>[0] & {
  employeeReads: Pick<EmployeeReadService, "holdEmployeeWrites" | "lockEmployees">;
};

type ParsedAdjustment = ReturnType<typeof parseAdjustment>;

async function findAdjustment(
  transact: Transact,
  id: string,
): Promise<{ id: string; allowanceId: string; amount: string }> {
  const parsed = parseUuid(id);
  const adjustment = parsed
    ? await transact((tx) => allowanceRepository(tx).findAdjustmentById(parsed))
    : null;
  if (!adjustment) {
    throw new ApplicationError("NOT_FOUND", "No adjustment has this id.");
  }
  return { id: parsed!, ...adjustment };
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

/**
 * Appends the adjustment to the person's current balance and returns that card's figures; a
 * repeated request appends nothing, and one reused for other values is refused.
 */
async function appendAdjustment(
  reads: CardReads,
  tx: Tx,
  input: { allowance: Allowance; adjustment: ParsedAdjustment; author: HistoryAuthor },
): Promise<{ card: EmployeeTimeOffType; lineId: string | null }> {
  const { allowance, adjustment, author } = input;
  return appendToCurrentCard(reads, tx, allowance, async (effectiveDate) => {
    const repository = allowanceRepository(tx);
    const newLine = {
      allowanceId: allowance.id,
      amount: adjustment.amount,
      effectiveDate,
      reason: adjustment.comment,
      author,
      requestId: adjustment.requestId,
    };
    const lineId = await repository.insertAdjustment(newLine);
    if (lineId === null && !isSameAdjustment(await repository.findAdjustment(newLine), newLine)) {
      throw invalidInput([{ field: "requestId", code: "taken" }]);
    }
    return lineId;
  });
}

/**
 * Appends a line to the person's current balance and returns that card's figures. Locks as
 * bookings do, so no start date, terms or policy change moves the card in between.
 */
async function appendToCurrentCard(
  reads: CardReads,
  tx: Tx,
  allowance: Allowance,
  append: (effectiveDate: CalendarDate) => Promise<string | null>,
): Promise<{ card: EmployeeTimeOffType; lineId: string | null }> {
  await lockCardInputs(reads, tx, allowance.employeeId);
  const date = reads.today();
  const onDate = { ...reads, today: () => date };
  if (date > allowance.leaveYearEnd) {
    throw new ApplicationError("CONFLICT", "This leave year has ended.");
  }
  if (!(await currentCardOf(onDate, tx, allowance))) {
    throw invalidInput([{ field: "allowanceId", code: "invalid" }]);
  }
  // The line counts for the card's leave year, which may start after today.
  const lineId = await append(date < allowance.leaveYearStart ? allowance.leaveYearStart : date);
  const card = await currentCardOf(onDate, tx, allowance);
  if (!card) {
    // Rolls the line back: the locks above keep the card, so this is a bug, not a race.
    throw new Error("The adjusted allowance is no longer the person's current balance.");
  }
  return { card, lineId };
}

/** Employee writes, then policies, then the person: the order every time off writer takes them. */
async function lockCardInputs(reads: CardReads, tx: Tx, employeeId: string): Promise<void> {
  await reads.employeeReads.holdEmployeeWrites(tx);
  await timeOffPolicyRepository(tx).sharePolicies();
  const [locked] = await reads.employeeReads.lockEmployees(tx, [employeeId]);
  if (!locked) {
    throw new ApplicationError("NOT_FOUND", "No allowance has this id.");
  }
}

function isSameAdjustment(
  saved: { amount: string; reason: string | null } | null,
  submitted: { amount: string; reason: string },
): boolean {
  return (
    saved !== null && Big(saved.amount).eq(submitted.amount) && saved.reason === submitted.reason
  );
}

/** The figures of the balance the person's card shows today, if it is this allowance. */
async function currentCardOf(
  reads: CardReads,
  tx: Tx,
  allowance: Allowance,
): Promise<EmployeeTimeOffType | undefined> {
  const types = await readTimeOffTypesInTransaction(reads, tx, [allowance.employeeId]);
  return types.get(allowance.employeeId)?.find(({ allowanceId }) => allowanceId === allowance.id);
}

/** The amount as decimal text, the trimmed comment and the request id; refuses any that is invalid. */
function parseAdjustment({ amount, comment, requestId }: AdjustmentInput) {
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
  const parsedRequestId = requestId == null ? crypto.randomUUID() : parseUuid(requestId);
  if (parsedRequestId === null) {
    errors.push({ field: "requestId", code: "invalid" });
  }
  if (errors.length > 0) {
    throw invalidInput(errors);
  }
  return { amount: days!.toString(), comment: trimmed, requestId: parsedRequestId! };
}

/** The trimmed reason for a reversal, null when blank; refuses one over the comment limit. */
function parseReversalComment(comment: string | null | undefined): string | null {
  const trimmed = comment?.trim() ?? "";
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw invalidInput([{ field: "comment", code: "too_long" }]);
  }
  return trimmed === "" ? null : trimmed;
}

/** The most an adjustment changes a balance by: a leap year's days. */
const MAX_ADJUSTMENT_DAYS = 366;
/** The booking note's limit, for the same kind of free text. */
const MAX_COMMENT_LENGTH = 1_000;
