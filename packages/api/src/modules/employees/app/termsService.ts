import type { Orm } from "../../../core/db";
import type { Connection, PageArgs } from "../../../core/pagination";
import { createRecordHistoryReaderService, type HistoryLine } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import { readTermsOverviews, type TermsOverview } from "./readTermsOverviews";
import { termsRecordType } from "./termsRecordType";

/** The terms admins see in Settings: each set with its people, locations and working week today. */
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
}

export function createTermsService({
  orm,
  today = todayInLondon,
}: {
  orm: Orm;
  today?: () => CalendarDate;
}): TermsService {
  const history = createRecordHistoryReaderService(orm, { terms: termsRecordType(orm) });
  return {
    async listTerms(ctx) {
      ctx.require("MANAGE_WORKSPACE");
      return readTermsOverviews(orm, today());
    },
    async readTerms(ctx, id) {
      ctx.require("MANAGE_WORKSPACE");
      const termsId = parseUuid(id);
      return termsId ? ((await readTermsOverviews(orm, today(), [termsId]))[0] ?? null) : null;
    },
    readTermsHistory: (ctx, termsId, args) => history.readHistory(ctx, "terms", termsId, args),
  };
}
