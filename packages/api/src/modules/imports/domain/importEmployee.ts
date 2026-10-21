import type { CalendarDate } from "../../../utils";
import type { ImportSource } from "./importSource";

/** An employee as one source proposes it; any field may be missing until review. */
export interface ImportEmployeeValues {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  startDate: CalendarDate | null;
}

/** One source's row of an employee: an import record, not yet an employee. */
export interface ImportEmployeeRecord extends ImportEmployeeValues {
  id: string;
  sourceId: string;
  /** The stored copy of the person's Slack photo; null for initials. */
  photoFileId: string | null;
}

/** A record as a source delivers it, before it is stored. */
export interface IncomingRecord {
  /** The record's id in its source, such as a Slack user id. */
  externalId: string;
  /** The source's values as they came. */
  raw: unknown;
  values: ImportEmployeeValues;
  /** Where the person's own photo can be downloaded; only Slack members have one. */
  photoUrl?: string | null;
}

/** The fields of an import employee the owner can choose, in the order review shows them. */
export const IMPORT_EMPLOYEE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "jobTitle",
  "startDate",
] as const;

export type ImportEmployeeField = (typeof IMPORT_EMPLOYEE_FIELDS)[number];

/** The owner's choice for one field: a record's value, or a typed one. */
export type ValueChoice = { recordId: string } | { value: string };

/** What the owner settled for one import employee, by its key. */
export interface ImportEmployeeChoices {
  key: string;
  leftOut: boolean;
  values: Partial<Record<ImportEmployeeField, ValueChoice>>;
}

/** The employee an import will create: the records sharing an email, or one record without an email. */
export interface ImportEmployee {
  /** The shared email, or `record:<id>` for a record without one; stable across re-reads. */
  key: string;
  /** Its key first, then the keys of the import employees a typed email merged into it. */
  keys: string[];
  /** In source order: file sources oldest first, then Slack; within a source, oldest first. */
  records: ImportEmployeeRecord[];
  values: Record<ImportEmployeeField, ImportEmployeeValue>;
  /** The photo of its first record that has one. */
  photoFileId: string | null;
  leftOut: boolean;
}

/** One field of an import employee: what review shows and Approve uses, and where it came from. */
export interface ImportEmployeeValue {
  /** A start date is `YYYY-MM-DD`. */
  value: string | null;
  choice: "default" | "picked" | "typed";
  /** The record whose value a pick shows; null unless picked. */
  pickedRecordId: string | null;
  /** The records' distinct non-empty values, in source order, with the records holding each. */
  options: { value: string; recordIds: string[] }[];
}

/**
 * Groups the import's records into import employees by email and applies the owner's
 * choices. A field shows the owner's pick or typed value, else the first source's value;
 * a typed email that another import employee has merges the two.
 */
export function groupEmployeeRecords(
  sources: readonly ImportSource[],
  records: readonly ImportEmployeeRecord[],
  choices: readonly ImportEmployeeChoices[],
): ImportEmployee[] {
  const choicesByKey = new Map(choices.map((choice) => [choice.key, choice]));
  const groups = new Map<string, Group>();
  const ordered = recordsInSourceOrder(sources, records);
  for (const [key, members] of groupByKey(ordered)) {
    const own = choicesByKey.get(key);
    const email = employeeValue(members, "email", own?.values.email).value;
    const identity = email ?? key;
    const group = groups.get(identity);
    if (!group) {
      groups.set(identity, { keys: [key], records: members, choices: own ? [own] : [] });
    } else if (key === identity) {
      // The import employee keyed by this email keeps its key, and its choices win.
      groups.set(identity, {
        keys: [key, ...group.keys],
        records: [...group.records, ...members],
        choices: own ? [own, ...group.choices] : group.choices,
      });
    } else {
      group.keys.push(key);
      group.records.push(...members);
      group.choices.push(...(own ? [own] : []));
    }
  }
  const order = new Map(ordered.map((record, index) => [record, index]));
  return [...groups.values()].map(({ keys, records: members, choices: owned }) => {
    const sorted = members.toSorted((a, b) => order.get(a)! - order.get(b)!);
    return {
      key: keys[0]!,
      keys,
      records: sorted,
      values: Object.fromEntries(
        IMPORT_EMPLOYEE_FIELDS.map((field) => [
          field,
          employeeValue(sorted, field, owned.find((choice) => choice.values[field])?.values[field]),
        ]),
      ) as Record<ImportEmployeeField, ImportEmployeeValue>,
      photoFileId: sorted.find((record) => record.photoFileId)?.photoFileId ?? null,
      leftOut: owned[0]?.leftOut ?? false,
    };
  });
}

/** A conflict the owner has not settled: two values or more and the default still shown. */
export function hasOpenConflict({ options, choice }: ImportEmployeeValue): boolean {
  return options.length > 1 && choice === "default";
}

/** The sources in the order their values win: files oldest first, then Slack. */
export function inSourceOrder(sources: readonly ImportSource[]): ImportSource[] {
  return [
    ...sources.filter(({ kind }) => kind === "file"),
    ...sources.filter(({ kind }) => kind === "slack"),
  ];
}

interface Group {
  keys: string[];
  records: ImportEmployeeRecord[];
  choices: ImportEmployeeChoices[];
}

/** The records by source order; within a source, the order given. */
function recordsInSourceOrder(
  sources: readonly ImportSource[],
  records: readonly ImportEmployeeRecord[],
): ImportEmployeeRecord[] {
  const rank = new Map(inSourceOrder(sources).map(({ id }, index) => [id, index]));
  return records.toSorted((a, b) => rank.get(a.sourceId)! - rank.get(b.sourceId)!);
}

function groupByKey(records: ImportEmployeeRecord[]): Map<string, ImportEmployeeRecord[]> {
  const groups = new Map<string, ImportEmployeeRecord[]>();
  for (const record of records) {
    const key = record.email ?? `record:${record.id}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return groups;
}

function employeeValue(
  records: readonly ImportEmployeeRecord[],
  field: ImportEmployeeField,
  choice: ValueChoice | undefined,
): ImportEmployeeValue {
  const options: ImportEmployeeValue["options"] = [];
  for (const record of records) {
    const value = record[field];
    if (value === null) {
      continue;
    }
    const option = options.find((existing) => existing.value === value);
    if (option) {
      option.recordIds.push(record.id);
    } else {
      options.push({ value, recordIds: [record.id] });
    }
  }
  if (choice && "value" in choice) {
    return { value: choice.value, choice: "typed", pickedRecordId: null, options };
  }
  const picked = choice && options.find(({ recordIds }) => recordIds.includes(choice.recordId));
  if (picked) {
    return { value: picked.value, choice: "picked", pickedRecordId: choice.recordId, options };
  }
  return { value: options[0]?.value ?? null, choice: "default", pickedRecordId: null, options };
}
