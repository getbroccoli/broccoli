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
import {
  deleteRefusal,
  parseTermsName,
  STANDARD_WEEKS,
  TermsNameTakenError,
  versionsFromToday,
} from "../domain";
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
  /**
   * New terms named `name`, inside `tx`, with the source terms' working week from today on,
   * today's from the beginning, and what `copyTermsParts` copies; nobody on them and no location.
   * Returns their id. Admins only.
   */
  cloneTerms: (
    ctx: SecurityContext,
    tx: Tx,
    input: { id: string; name: string },
  ) => Promise<string>;
}

export function createTermsService({
  orm,
  transact,
  logger,
  copyTermsParts,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  /** Copies what other modules keep on terms, such as time off rules, onto cloned terms. */
  copyTermsParts: CopyTermsParts;
  today?: () => CalendarDate;
}): TermsService {
  const history = createRecordHistoryReaderService(orm, { terms: termsRecordType(orm, today) });
  return {
    async listTerms(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return readTermsOverviews(orm, today());
    },
    async readTerms(ctx, id) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseUuid(id);
      return termsId ? ((await readOverview(orm, today(), termsId)) ?? null) : null;
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
      return (await readOverview(orm, today(), termsId))!;
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
      return (await readOverview(orm, today(), termsId))!;
    },

    async deleteTerms(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseTermsId(input.id);
      await transact(async (tx) => {
        const terms = await termsRepository(tx).lock(termsId);
        if (!terms) {
          throw termsNotFound();
        }
        const { deleteBlocker, locations } = (await readOverview(tx, today(), termsId))!;
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

    async cloneTerms(ctx, tx, { id, name: givenName }) {
      ctx.require("MANAGE_WORKSPACE");
      const sourceId = parseTermsId(id);
      const name = parseTermsName(givenName);
      // Not `lock`: offering a type holds the policies, then checks these terms' row by key.
      if (!(await termsRepository(tx).keep(sourceId))) {
        throw termsNotFound();
      }
      const cloneId = await refuseTakenName(() => termsRepository(tx).insert(name));
      // Before the week: editing time off rules holds the policies, then reads working patterns.
      await copyTermsParts(ctx, tx, { fromTermsId: sourceId, toTermsId: cloneId });
      const patterns = workingPatternRepository(tx);
      const source = (await patterns.findPatterns()).find(({ termsId }) => termsId === sourceId)!;
      // Today's week covers the past too, as on new terms: a first version starts from the beginning.
      const [current, ...planned] = versionsFromToday(source.versions, today(), null);
      const patternId = await patterns.insertPattern({ termsId: cloneId }, current!);
      for (const version of planned) {
        await patterns.insertVersion(patternId, version);
      }
      await recordNameChange(ctx, tx, "CREATED", cloneId, { from: null, to: name });
      return cloneId;
    },
  };
}

/** Copies the source terms' rows another module owns, such as time off rules, onto the clone. */
export type CopyTermsParts = (
  ctx: SecurityContext,
  tx: Tx,
  input: { fromTermsId: string; toTermsId: string },
) => Promise<void>;

const recordHistory = createRecordHistoryService();

/** One set of terms as Settings shows it; undefined when none has the id. */
async function readOverview(
  db: Orm | Tx,
  date: CalendarDate,
  termsId: string,
): Promise<TermsOverview | undefined> {
  return (await readTermsOverviews(db, date, [termsId]))[0];
}

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
