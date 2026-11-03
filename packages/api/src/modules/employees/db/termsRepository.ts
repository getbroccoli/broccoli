import { eq, inArray } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { TermsMembership } from "../domain";
import { employeeTerms } from "./employeeTermsTable";
import { terms } from "./termsTable";

/** Terms and who is on them, through the pool or inside a transaction. */
export interface TermsRepository {
  /** Puts new employees on the seeded "England and Wales" terms since their employment started. */
  joinEnglandAndWalesTerms(employeeIds: readonly string[]): Promise<void>;
  /** The id of the seeded "England and Wales" terms. */
  findEnglandAndWalesId(): Promise<string>;
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
    async joinEnglandAndWalesTerms(employeeIds) {
      if (employeeIds.length === 0) {
        return;
      }
      const englandAndWalesId = await findEnglandAndWalesId(orm());
      await orm()
        .insert(employeeTerms)
        .values(employeeIds.map((employeeId) => ({ employeeId, termsId: englandAndWalesId })));
    },

    findEnglandAndWalesId: () => findEnglandAndWalesId(orm()),

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

async function findEnglandAndWalesId(orm: ReturnType<typeof ormOf>): Promise<string> {
  const [englandAndWales] = await orm
    .select({ id: terms.id })
    .from(terms)
    .where(eq(terms.key, "england_and_wales"));
  return englandAndWales!.id;
}
