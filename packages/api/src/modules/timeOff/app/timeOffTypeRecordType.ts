import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { parseUuid } from "../../../utils";
import { timeOffPolicyRepository } from "../db";

/**
 * The time off type as a record type that keeps history, its policies' changes included. Only
 * admins read it: a type is no one's own, so its subject is "public".
 */
export function timeOffTypeRecordType(orm: Orm): RecordTypeRegistration {
  const typesOf = async (ids: readonly string[]) =>
    (await timeOffPolicyRepository(orm).findAllTypes()).filter(({ id }) => ids.includes(id));
  return {
    graphqlType: "TimeOffType",
    canonicalId: parseUuid,
    subjectsOf: async (ids) => new Map((await typesOf(ids)).map(({ id }) => [id, "public"])),
    loadRecords: async (ids) => new Map((await typesOf(ids)).map((type) => [type.id, type])),
    permissions: {
      object: "time_off_type",
      editableFields: ["name", "icon", "colour", "reasonVisibleToColleagues", "policies"],
    },
  };
}
