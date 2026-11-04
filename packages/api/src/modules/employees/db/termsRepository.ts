import { eq, inArray, isNull, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { TermsMembership } from "../domain";
import { employees } from "./employeesTable";
import { employeeTerms } from "./employeeTermsTable";
import { locations } from "./locationsTable";
import { terms } from "./termsTable";
import { termsWorkingPatterns } from "./termsWorkingPatternsTable";
import { workingPatterns } from "./workingPatternsTable";

/** Terms and who is on them, through the pool or inside a transaction. */
export interface TermsRepository {
  /**
   * Puts new employees on their location's default terms, or the default terms ("England and
   * Wales") without one, since their employment started.
   */
  joinDefaultTerms(employees: readonly { id: string; locationId: string | null }[]): Promise<void>;
  /** New terms with this name; returns their id. */
  insert(name: string): Promise<string>;
  /**
   * Moves each employee whose only terms are the default ones, undated, onto their location's
   * default terms from the beginning; returns their ids.
   */
  moveToLocationDefaults(): Promise<string[]>;
  /**
   * Deletes every terms but the default ones and every working pattern but Standard, and puts the
   * default terms back on Standard from the beginning; the terms must have no members.
   */
  resetToDefault(): Promise<void>;
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
    async joinDefaultTerms(employees) {
      if (employees.length === 0) {
        return;
      }
      const defaultTermsId = await findDefaultTermsId(orm());
      const locationIds = [...new Set(employees.flatMap(({ locationId }) => locationId ?? []))];
      const locationTerms = new Map(
        locationIds.length === 0
          ? []
          : (
              await orm()
                .select({ id: locations.id, termsId: locations.defaultTermsId })
                .from(locations)
                .where(inArray(locations.id, locationIds))
            ).map(({ id, termsId }) => [id, termsId]),
      );
      await orm()
        .insert(employeeTerms)
        .values(
          employees.map(({ id, locationId }) => ({
            employeeId: id,
            termsId: (locationId && locationTerms.get(locationId)) || defaultTermsId,
          })),
        );
    },

    async insert(name) {
      const [inserted] = await orm().insert(terms).values({ name }).returning({ id: terms.id });
      return inserted!.id;
    },

    async moveToLocationDefaults() {
      const { rows } = await orm().execute<{ employee_id: string }>(sql`
        update ${employeeTerms} as membership
        set terms_id = location.default_terms_id
        from ${employees} as employee
        join ${locations} as location on location.id = employee.location_id
        join ${terms} as current on current.key = 'default_terms'
        where membership.employee_id = employee.id
          and membership.terms_id = current.id
          and membership.effective_from is null
          and membership.effective_until is null
          and location.default_terms_id <> current.id
          and not exists (
            select 1 from ${employeeTerms} as other
            where other.employee_id = membership.employee_id and other.id <> membership.id
          )
        returning membership.employee_id
      `);
      return rows.map(({ employee_id }) => employee_id);
    },

    async resetToDefault() {
      const defaultTermsId = await findDefaultTermsId(orm());
      await orm().delete(terms).where(isNull(terms.key));
      await orm()
        .delete(termsWorkingPatterns)
        .where(eq(termsWorkingPatterns.termsId, defaultTermsId));
      await orm().delete(workingPatterns).where(isNull(workingPatterns.key));
      const [standard] = await orm()
        .select({ id: workingPatterns.id })
        .from(workingPatterns)
        .where(eq(workingPatterns.key, "standard_working_pattern"));
      await orm()
        .insert(termsWorkingPatterns)
        .values({ termsId: defaultTermsId, workingPatternId: standard!.id });
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
