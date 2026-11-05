import { type FieldError, invalidInput } from "../../../core/applicationError";
import type { FieldChange } from "../../../core/records";
import { parseUuid } from "../../../utils";
import type { DatedPolicy } from "./allowanceCalculator";
import {
  TIME_OFF_TYPE_COLOURS,
  TIME_OFF_TYPE_ICONS,
  type TimeOffTypeColour,
  type TimeOffTypeIcon,
} from "./timeOffTypeLook";

type Balance = DatedPolicy["balance"];
type BankHolidays = NonNullable<DatedPolicy["bankHolidays"]>;

/** One save of a time off type's panel: only the fields sent change. */
export interface UpdateTimeOffTypeInput {
  id: string;
  name?: string | null;
  icon?: string | null;
  colour?: string | null;
  reasonVisibleToColleagues?: boolean | null;
  policies?: readonly PolicyChangeInput[] | null;
  addPolicies?: readonly NewPolicyInput[] | null;
  deletePolicyIds?: readonly string[] | null;
}

export interface PolicyChangeInput {
  id: string;
  name?: string | null;
  balance?: Balance | null;
  allowanceDays?: number | null;
  bankHolidays?: BankHolidays | null;
}

export interface NewPolicyInput {
  name: string;
  balance: Balance;
  allowanceDays?: number | null;
  bankHolidays?: BankHolidays | null;
}

/** A save with its ids parsed, names trimmed and amounts checked; a bad id is null. */
export interface ParsedTimeOffTypeUpdate {
  id: string | null;
  name?: string;
  icon?: TimeOffTypeIcon;
  colour?: TimeOffTypeColour;
  reasonVisibleToColleagues?: boolean;
  policies: (Omit<PolicyChangeInput, "id" | "name"> & { id: string | null; name?: string })[];
  addPolicies: NewPolicyInput[];
  deletePolicyIds: (string | null)[];
}

/** The type's own fields as history records them. */
export interface TimeOffTypeFields {
  name: string;
  icon: string | null;
  colour: string | null;
  reasonVisibleToColleagues: boolean;
}

/** A policy's fields as history records them. */
export interface TimeOffPolicyFields {
  policyName: string;
  policyBalance: Balance;
  allowanceDays: number | null;
  bankHolidays: BankHolidays | null;
}

/** Checks a save's shape; refuses with every field error at once. */
export function parseTimeOffTypeUpdate(input: UpdateTimeOffTypeInput): ParsedTimeOffTypeUpdate {
  const errors: FieldError[] = [];
  const name = optionalName(input.name, "name", errors);
  const icon = optionalOf(input.icon, TIME_OFF_TYPE_ICONS, "icon", errors);
  const colour = optionalOf(input.colour, TIME_OFF_TYPE_COLOURS, "colour", errors);
  const policies = (input.policies ?? []).map((change, index) => {
    checkDays(change.allowanceDays, `policies.${index}.allowanceDays`, errors);
    return {
      ...change,
      id: parseUuid(change.id),
      name: optionalName(change.name, `policies.${index}.name`, errors),
    };
  });
  const addPolicies = (input.addPolicies ?? []).map((policy, index) => {
    checkDays(policy.allowanceDays, `addPolicies.${index}.allowanceDays`, errors);
    return { ...policy, name: optionalName(policy.name, `addPolicies.${index}.name`, errors)! };
  });
  if (errors.length > 0) {
    throw invalidInput(errors);
  }
  return {
    id: parseUuid(input.id),
    ...definedOnly({ name, icon, colour }),
    ...definedOnly({ reasonVisibleToColleagues: input.reasonVisibleToColleagues ?? undefined }),
    policies,
    addPolicies,
    deletePolicyIds: (input.deletePolicyIds ?? []).map(parseUuid),
  };
}

/** The type's fields that differ, as history records them. */
export function timeOffTypeChanges(
  before: TimeOffTypeFields,
  after: TimeOffTypeFields,
): FieldChange[] {
  return changedFields(before, after);
}

/** The policy's fields that differ, as history records them. */
export function timeOffPolicyChanges(
  before: TimeOffPolicyFields | null,
  after: TimeOffPolicyFields | null,
): FieldChange[] {
  const empty = { policyName: null, policyBalance: null, allowanceDays: null, bankHolidays: null };
  return changedFields(before ?? empty, after ?? empty);
}

function changedFields<
  Fields extends { [Field in keyof Fields]: string | number | boolean | null },
>(before: Fields, after: Fields): FieldChange[] {
  return (Object.keys(after) as (keyof Fields)[]).flatMap((field) => {
    const [oldValue, newValue] = [asText(before[field]), asText(after[field])];
    return oldValue === newValue ? [] : [{ field: String(field), oldValue, newValue }];
  });
}

function asText(value: string | number | boolean | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function optionalName(
  value: string | null | undefined,
  field: string,
  errors: FieldError[],
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    errors.push({ field, code: "required" });
  }
  return trimmed;
}

function optionalOf<Value extends string>(
  value: string | null | undefined,
  allowed: readonly Value[],
  field: string,
  errors: FieldError[],
): Value | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as Value)) {
    errors.push({ field, code: "invalid" });
  }
  return value as Value;
}

/** An allowance is whole or half days, from 0 to 366. */
function checkDays(days: number | null | undefined, field: string, errors: FieldError[]): void {
  if (days === null || days === undefined) {
    return;
  }
  if (days < 0 || days > MAX_ALLOWANCE_DAYS || !Number.isInteger(days * 2)) {
    errors.push({ field, code: "invalid" });
  }
}

function definedOnly<Fields extends object>(fields: Fields): Partial<Fields> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Fields>;
}

/** The most days a year an allowance can grant. */
const MAX_ALLOWANCE_DAYS = 366;
