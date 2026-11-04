import { eq, inArray } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { TermsMembership } from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { terms } from "./termsTable";

/** Terms and who is on them, through the pool or inside a transaction. */
export interface TermsRepository {
  /** Puts new employees on the default terms ("England and Wales") since their employment started. */
  joinDefaultTerms(employeeIds: readonly string[]): Promise<void>;
  /** The id of the default terms, the seeded "England and Wales". */
  findDefaultTermsId(): Promise<string>;
  /** Whether terms have this id. */
  exists(termsId: string): Promise<boolean>;
  /** Each employee's terms over time, by employee id. */
  findMemberships(employeeIds: readonly string[]): Promise<Map<string, TermsMembership[]>>;
  /** The employees on the terms on any date. */
  findMemberIds(termsId: string): Promise<string[]>;
}

export function termsRepository(db: Orm | Tx): TermsRepository {
  const orm = () => ormOf(db);
  return {
    async joinDefaultTerms(employeeIds) {
      if (employeeIds.length === 0) {
        return;
      }
      const defaultTermsId = await findDefaultTermsId(orm());
      await orm()
        .insert(employeeTerms)
        .values(employeeIds.map((employeeId) => ({ employeeId, termsId: defaultTermsId })));
    },

    findDefaultTermsId: () => findDefaultTermsId(orm()),

    async exists(termsId) {
      const [found] = await orm().select({ id: terms.id }).from(terms).where(eq(terms.id, termsId));
      return found !== undefined;
    },

    async findMemberships(employeeIds) {
      const rows = await orm()
        .select()
        .from(employeeTerms)
        .where(inArray(employeeTerms.employeeId, [...employeeIds]));
      const memberships = new Map<string, TermsMembership[]>();
      for (const { employeeId, termsId, effectiveFrom, effectiveUntil } of rows) {
        const membership = { termsId, effectiveFrom, effectiveUntil };
        memberships.set(employeeId, [...(memberships.get(employeeId) ?? []), membership]);
      }
      return memberships;
    },

    async findMemberIds(termsId) {
      const rows = await orm()
        .selectDistinct({ employeeId: employeeTerms.employeeId })
        .from(employeeTerms)
        .where(eq(employeeTerms.termsId, termsId));
      return rows.map(({ employeeId }) => employeeId);
    },
  };
}

async function findDefaultTermsId(orm: ReturnType<typeof ormOf>): Promise<string> {
  const [defaultTerms] = await orm
    .select({ id: terms.id })
    .from(terms)
    .where(eq(terms.key, "default_terms"));
  return defaultTerms!.id;
}
