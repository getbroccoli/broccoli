import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { parseUuid, todayInLondon } from "../../../utils";
import { readTermsOverviews } from "./termsOverviews";

/** Terms as a record type that keeps history: about nobody, so only admins, who hold the grant, read them. */
export function termsRecordType(orm: Orm): RecordTypeRegistration {
  const load = async (ids: readonly string[]) =>
    new Map(
      (await readTermsOverviews(orm, todayInLondon(), ids)).map((terms) => [terms.id, terms]),
    );
  return {
    graphqlType: "Terms",
    canonicalId: parseUuid,
    subjectsOf: async (ids) => new Map([...(await load(ids)).keys()].map((id) => [id, "public"])),
    loadRecords: load,
    permissions: { object: "terms", editableFields: [] },
  };
}
