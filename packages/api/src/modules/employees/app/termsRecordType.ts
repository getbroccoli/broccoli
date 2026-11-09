import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import { termsRepository } from "../db";
import { readTermsOverviews } from "./readTermsOverviews";

/** Terms as a record type that keeps history: about nobody, so only admins, who hold the grant, read and rename them. */
export function termsRecordType(
  orm: Orm,
  today: () => CalendarDate = todayInLondon,
): RecordTypeRegistration {
  return {
    graphqlType: "Terms",
    canonicalId: parseUuid,
    subjectsOf: async (ids) =>
      new Map(
        (await termsRepository(orm).findAll())
          .filter(({ id }) => ids.includes(id))
          .map(({ id }) => [id, "public"]),
      ),
    loadRecords: async (ids) =>
      new Map((await readTermsOverviews(orm, today(), ids)).map((terms) => [terms.id, terms])),
    permissions: { object: "terms", editableFields: ["name"] },
  };
}
