import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { ModuleDependencies } from "../../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../../utils";
import { employeeRepository, employmentRepository, termsRepository } from "../../db";
import {
  cancelTermsMove,
  parseChangeDate,
  parseEmployeeIds,
  planTermsMove,
  type TermsMembership,
  type TermsMoveSkipReason,
} from "../../domain";
import { employeeNotFound } from "../employeeNotFound";

const recordHistory = createRecordHistoryService();

/** Moving people to other terms from a date, and cancelling a move that has not started. Admins only. */
export interface EmployeeTermsService {
  /**
   * Moves each person to the terms from `startDate`, or from their start date when they start
   * later; a later move stays. Skips, saying why, a person already on the terms then or who left
   * before. Adds a history line per person moved.
   */
  changeTerms: (ctx: SecurityContext, input: TermsChangeInput) => Promise<TermsChange>;
  /** What `changeTerms` would do, writing nothing. */
  previewTermsChange: (ctx: SecurityContext, input: TermsChangeInput) => Promise<TermsChange>;
  /**
   * Removes the person's move starting on `startDate`; the terms before it run on. CONFLICT once
   * it has started, or when there is none.
   */
  cancelTermsChange: (
    ctx: SecurityContext,
    input: { employeeId: string; startDate: string },
  ) => Promise<void>;
}

export interface TermsChangeInput {
  employeeIds: readonly string[];
  termsId: string;
  startDate: string;
}

/** Who a move reaches and who it leaves as they are. */
export interface TermsChange {
  /** In input order, each with the date they move from. */
  moved: { employeeId: string; startDate: CalendarDate }[];
  skipped: { employeeId: string; reason: TermsMoveSkipReason }[];
}

export function createEmployeeTermsService({
  transact,
  logger,
  today = todayInLondon,
}: Pick<ModuleDependencies, "transact" | "logger"> & {
  today?: () => CalendarDate;
}): EmployeeTermsService {
  return {
    async changeTerms(ctx, input) {
      const request = parseRequest(ctx, input, today());
      const change = await transact(async (tx) => {
        await employmentRepository(tx).lockForWrites();
        const { moves, skipped, names } = await planMoves(tx, request);
        await termsRepository(tx).replaceMemberships(
          new Map(moves.map(({ employeeId, memberships }) => [employeeId, memberships])),
        );
        await recordHistory.append(ctx, tx, {
          recordType: "employee",
          operation: "UPDATED",
          cause: { kind: "EDITED_DIRECTLY" },
          records: moves.map(({ employeeId, from, fromTermsId }) => ({
            recordId: employeeId,
            changes: [
              {
                field: "terms",
                oldValue: fromTermsId && termsValue(fromTermsId, from),
                newValue: termsValue(request.termsId, from),
                oldLabel: fromTermsId && (names.get(fromTermsId) ?? null),
                newLabel: names.get(request.termsId) ?? null,
              },
            ],
          })),
        });
        publishTermsChange(
          tx,
          moves.map(({ employeeId }) => employeeId),
          moves.map(({ from }) => from).toSorted()[0],
        );
        return {
          moved: moves.map(({ employeeId, from }) => ({ employeeId, startDate: from })),
          skipped,
        };
      });
      logger.info(
        {
          termsId: request.termsId,
          startDate: request.startDate,
          movedCount: change.moved.length,
          skippedCount: countBy(change.skipped.map(({ reason }) => reason)),
        },
        "Moved people to terms",
      );
      return change;
    },

    async previewTermsChange(ctx, input) {
      const request = parseRequest(ctx, input, today());
      const { moves, skipped } = await transact((tx) => planMoves(tx, request));
      return {
        moved: moves.map(({ employeeId, from }) => ({ employeeId, startDate: from })),
        skipped,
      };
    },

    async cancelTermsChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const employeeId = parseUuid(input.employeeId);
      if (!employeeId) {
        throw employeeNotFound();
      }
      const cancelled = await transact(async (tx) => {
        await employmentRepository(tx).lockForWrites();
        if (!(await employeeRepository(tx).findById(employeeId))) {
          throw employeeNotFound();
        }
        const terms = termsRepository(tx);
        const rows = (await terms.findMemberships([employeeId])).get(employeeId) ?? [];
        const { cancelled: row, memberships } = cancelTermsMove(rows, input.startDate, today());
        await terms.replaceMemberships(new Map([[employeeId, memberships]]));
        const name = (await terms.findNames([row.termsId])).get(row.termsId) ?? null;
        await recordHistory.append(ctx, tx, {
          recordType: "employee",
          operation: "UPDATED",
          cause: { kind: "EDITED_DIRECTLY" },
          records: [
            {
              recordId: employeeId,
              changes: [
                {
                  field: "terms",
                  oldValue: termsValue(row.termsId, row.startDate!),
                  newValue: null,
                  oldLabel: name,
                  newLabel: null,
                },
              ],
            },
          ],
        });
        publishTermsChange(tx, [employeeId], row.startDate!);
        return row;
      });
      logger.info(
        { employeeId, termsId: cancelled.termsId, startDate: cancelled.startDate },
        "Cancelled a terms move",
      );
    },
  };
}

interface Request {
  employeeIds: string[];
  termsId: string;
  startDate: CalendarDate;
}

function parseRequest(ctx: SecurityContext, input: TermsChangeInput, today: CalendarDate): Request {
  ctx.require("MANAGE_WORKSPACE");
  const employeeIds = parseEmployeeIds(input.employeeIds);
  const startDate = parseChangeDate(input.startDate, today);
  const termsId = parseUuid(input.termsId);
  if (!termsId) {
    throw termsNotFound();
  }
  return { employeeIds, termsId, startDate };
}

interface PlannedMove {
  employeeId: string;
  from: CalendarDate;
  fromTermsId: string | null;
  memberships: TermsMembership[];
}

/** Each person's move or why they are skipped, in input order, with the names of every terms involved. */
async function planMoves(
  tx: Tx,
  { employeeIds, termsId, startDate }: Request,
): Promise<{
  moves: PlannedMove[];
  skipped: TermsChange["skipped"];
  names: Map<string, string>;
}> {
  const terms = termsRepository(tx);
  // Kept until the transaction ends, so the terms cannot be deleted while people move onto them.
  if (!(await terms.keep(termsId))) {
    throw termsNotFound();
  }
  if ((await employeeRepository(tx).findByIds(employeeIds)).length < employeeIds.length) {
    throw employeeNotFound();
  }
  const memberships = await terms.findMemberships(employeeIds);
  const employments = await employmentRepository(tx).findPeriods(employeeIds);
  const moves: PlannedMove[] = [];
  const skipped: TermsChange["skipped"] = [];
  for (const employeeId of employeeIds) {
    const plan = planTermsMove(
      {
        memberships: memberships.get(employeeId) ?? [],
        employments: employments.get(employeeId) ?? [],
      },
      termsId,
      startDate,
    );
    if (plan.kind === "skip") {
      skipped.push({ employeeId, reason: plan.reason });
    } else {
      moves.push({ employeeId, ...plan });
    }
  }
  const named = [termsId, ...moves.flatMap(({ fromTermsId }) => fromTermsId ?? [])];
  return { moves, skipped, names: await terms.findNames([...new Set(named)]) };
}

/** A terms change's value in history: the terms and the date it applies from. */
function termsValue(termsId: string, startDate: CalendarDate): string {
  return JSON.stringify({ termsId, startDate });
}

/** Tells other modules these people's terms, and so maybe their weeks and rules, changed from `from`. */
function publishTermsChange(tx: Tx, employeeIds: string[], from: CalendarDate | undefined) {
  if (employeeIds.length > 0 && from) {
    tx.publish("employees.terms_changed", { employeeIds, from });
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...Map.groupBy(values, (value) => value)].map(([key, all]) => [key, all.length]),
  );
}

function termsNotFound(): ApplicationError {
  return invalidInput([{ field: "termsId", code: "not_found" }]);
}
