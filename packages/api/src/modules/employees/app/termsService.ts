import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { Connection, PageArgs } from "../../../core/pagination";
import {
  createRecordHistoryReaderService,
  createRecordHistoryService,
  type HistoryLine,
  type RecordOperation,
} from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import type { BankHolidayCalendar } from "../../bankHolidays";
import { termsRepository, workingPatternRepository } from "../db";
import { deleteRefusal, parseTermsName, STANDARD_WEEKS, TermsNameTakenError } from "../domain";
import { readTermsOverviews, type TermsOverview } from "./readTermsOverviews";
import { termsRecordType } from "./termsRecordType";

/** The terms admins see and manage in Settings: each set with its people, locations and working week. */
export interface TermsService {
  /** Every set of terms, the default first, then by name ignoring case. Admins only. */
  listTerms: (ctx: SecurityContext) => Promise<TermsOverview[]>;
  /** One set of terms; null when none has this id, or the id is not a uuid. Admins only. */
  readTerms: (ctx: SecurityContext, termsId: string) => Promise<TermsOverview | null>;
  /** A set of terms' history, newest first; read as `recordHistory` reads it. */
  readTermsHistory: (
    ctx: SecurityContext,
    termsId: string,
    args: PageArgs,
  ) => Promise<Connection<HistoryLine>>;
  /** Adds terms on a Mon–Fri week with these bank holidays and no time off offered. Admins only. */
  createTerms: (
    ctx: SecurityContext,
    input: { name: string; bankHolidayCalendar: BankHolidayCalendar },
  ) => Promise<TermsOverview>;
  /** Changes the terms' name when given; null is refused, since terms always have one. Admins only. */
  updateTerms: (
    ctx: SecurityContext,
    input: { id: string; name?: string | null },
  ) => Promise<TermsOverview>;
  /**
   * Deletes terms nobody was ever on and no location starts people on, never the default terms;
   * refuses others with CONFLICT saying why. Admins only.
   */
  deleteTerms: (ctx: SecurityContext, input: { id: string }) => Promise<{ deletedTermsId: string }>;
}

export function createTermsService({
  orm,
  transact,
  logger,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  today?: () => CalendarDate;
}): TermsService {
  const history = createRecordHistoryReaderService(orm, { terms: termsRecordType(orm) });
  const readOverview = async (db: Orm | Tx, termsId: string) =>
    (await readTermsOverviews(db, today(), [termsId]))[0];
  return {
    async listTerms(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return readTermsOverviews(orm, today());
    },
    async readTerms(ctx, id) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseUuid(id);
      return termsId ? ((await readOverview(orm, termsId)) ?? null) : null;
    },
    readTermsHistory: (ctx, termsId, args) => history.readHistory(ctx, "terms", termsId, args),

    async createTerms(ctx, { name: givenName, bankHolidayCalendar }) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parseTermsName(givenName);
      const termsId = await refuseTakenName(() =>
        transact(async (tx) => {
          const id = await termsRepository(tx).insert(name);
          await workingPatternRepository(tx).insertPattern(
            { termsId: id },
            { ...STANDARD_WEEKS.monday_to_friday_7_5_hours, bankHolidayCalendar },
          );
          await recordNameChange(ctx, tx, "CREATED", id, { from: null, to: name });
          return id;
        }),
      );
      logger.info({ termsId, bankHolidayCalendar }, "Created terms");
      return (await readOverview(orm, termsId))!;
    },

    async updateTerms(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseTermsId(input.id);
      const name = parseNameChange(input.name);
      const renamed = await refuseTakenName(() =>
        transact(async (tx) => {
          const terms = await termsRepository(tx).lock(termsId);
          if (!terms) {
            throw termsNotFound();
          }
          if (name === undefined || name === terms.name) {
            return false;
          }
          await termsRepository(tx).rename(termsId, name);
          await recordNameChange(ctx, tx, "UPDATED", termsId, { from: terms.name, to: name });
          return true;
        }),
      );
      if (renamed) {
        logger.info({ termsId }, "Renamed terms");
      }
      return (await readOverview(orm, termsId))!;
    },

    async deleteTerms(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseTermsId(input.id);
      await transact(async (tx) => {
        const terms = await termsRepository(tx).lock(termsId);
        if (!terms) {
          throw termsNotFound();
        }
        const { deleteBlocker, locations } = (await readOverview(tx, termsId))!;
        if (deleteBlocker) {
          const names = locations.map(({ name }) => name);
          throw new ApplicationError("CONFLICT", deleteRefusal(deleteBlocker, names));
        }
        await recordNameChange(ctx, tx, "DELETED", termsId, { from: terms.name, to: null });
        await termsRepository(tx).delete(termsId);
      });
      logger.info({ termsId }, "Deleted terms");
      return { deletedTermsId: termsId };
    },
  };
}

const recordHistory = createRecordHistoryService();

/** One history line on the terms naming them: created (from null), renamed, or deleted (to null). */
async function recordNameChange(
  ctx: SecurityContext,
  tx: Tx,
  operation: RecordOperation,
  termsId: string,
  { from, to }: { from: string | null; to: string | null },
): Promise<void> {
  await recordHistory.append(ctx, tx, {
    recordType: "terms",
    operation,
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: termsId, changes: [{ field: "name", oldValue: from, newValue: to }] }],
  });
}

/** The new name, or undefined when left out; terms always have a name, so null is refused. */
function parseNameChange(name: string | null | undefined): string | undefined {
  if (name === null) {
    throw invalidInput([{ field: "name", code: "required" }]);
  }
  return name === undefined ? undefined : parseTermsName(name);
}

function parseTermsId(id: string): string {
  const parsed = parseUuid(id);
  if (!parsed) {
    throw termsNotFound();
  }
  return parsed;
}

async function refuseTakenName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof TermsNameTakenError) {
      throw invalidInput([{ field: "name", code: "taken" }]);
    }
    throw error;
  }
}

function termsNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "No terms have this id.");
}
