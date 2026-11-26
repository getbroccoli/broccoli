import type { Orm } from "../../../core/db";
import type { RecordTypeRegistration } from "../../../core/records";
import { parseUuid } from "../../../utils";
import { dayCount } from "../domain";
import { timeOffRequestRepository } from "../db";

/**
 * Time off as a record type: its subject is its person, so core reads it, its history and its
 * access through the `time_off` grants; no field is ever edited, so it is never updated. A process
 * may run on it, about its person, as an approval does.
 */
export function timeOffRecordType(orm: Orm): RecordTypeRegistration {
  return {
    graphqlType: "TimeOff",
    canonicalId: parseUuid,
    subjectsOf: async (ids) => {
      const found = await timeOffRequestRepository(orm).findByIds(ids);
      return new Map(found.map(({ id, employeeId }) => [id, employeeId]));
    },
    loadRecords: async (ids) => {
      const found = await timeOffRequestRepository(orm).findWithDays(ids);
      return new Map(
        found.map(({ createdAt, ...record }) => [
          record.id,
          { ...record, cost: dayCount(record.days), bookedAt: createdAt },
        ]),
      );
    },
    permissions: { object: "time_off", editableFields: [] },
    processes: {
      readSubjects: async (tx, ids) => {
        const found = await timeOffRequestRepository(tx).findByIds(
          ids.flatMap((id) => parseUuid(id) ?? []),
        );
        return new Map(found.map(({ id, employeeId }) => [id, employeeId]));
      },
    },
  };
}
