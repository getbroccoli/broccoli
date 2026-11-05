import { ApplicationError, type FieldError, invalidInput } from "../../../core/applicationError";
import type { PolicyValues } from "../db";
import {
  isReasonAlwaysPrivate,
  type ParsedTimeOffTypeUpdate,
  type TimeOffPolicy,
  type TimeOffType,
} from "../domain";
import type { TimeOffPolicySettings, TimeOffTypeSettings } from "./timeOffTypeSettings";

/** The type as it is before the save, with its policies and the other types' names. */
export interface CurrentTimeOffType {
  type: TimeOffType;
  settings: TimeOffTypeSettings;
  policies: TimeOffPolicy[];
  otherTypeNames: string[];
}

/** A policy to change: what it is, what it becomes, and whether what it grants moves. */
export interface PolicyEdit {
  policy: TimeOffPolicy;
  next: PolicyValues & { days: number | null };
  grantChanged: boolean;
}

export interface UpdatePlan {
  typeFields: Partial<{
    name: string;
    icon: TimeOffType["icon"] & string;
    colour: TimeOffType["colour"] & string;
    private: boolean;
  }>;
  edits: PolicyEdit[];
  adds: (PolicyValues & { days: number | null })[];
  deletes: TimeOffPolicy[];
}

/** Checks the save against what exists and works out each write; refuses before anything is written. */
export function planUpdate(current: CurrentTimeOffType, save: ParsedTimeOffTypeUpdate): UpdatePlan {
  const errors: FieldError[] = [];
  const typeFields = planTypeFields(current, save, errors);
  const deletes = save.deletePolicyIds.map((id) => deletablePolicy(current, id));
  checkEachPolicyOnce(save, errors);
  const edits = save.policies.map((change, index) => planEdit(current, change, index, errors));
  const adds = save.addPolicies.map((policy, index) =>
    nextValues(
      { name: policy.name, balance: policy.balance, allowance: null, leaveYear: null },
      policy,
      `addPolicies.${index}`,
      errors,
    ),
  );
  checkPolicyNames(current, { edits, adds, deletes }, save, errors);
  if (errors.length > 0) {
    throw invalidInput(errors);
  }
  return { typeFields, edits, adds, deletes };
}

function planTypeFields(
  current: CurrentTimeOffType,
  save: ParsedTimeOffTypeUpdate,
  errors: FieldError[],
): UpdatePlan["typeFields"] {
  if (save.name !== undefined && sameName(current.otherTypeNames, save.name)) {
    errors.push({ field: "name", code: "taken" });
  }
  if (save.reasonVisibleToColleagues && isReasonAlwaysPrivate(current.type)) {
    errors.push({ field: "reasonVisibleToColleagues", code: "invalid" });
  }
  return Object.fromEntries(
    Object.entries({
      name: save.name,
      icon: save.icon,
      colour: save.colour,
      private:
        save.reasonVisibleToColleagues === undefined ? undefined : !save.reasonVisibleToColleagues,
    }).filter(([, value]) => value !== undefined),
  );
}

/** A policy of this type that may be deleted; refuses one that was ever used. */
function deletablePolicy(current: CurrentTimeOffType, id: string | null): TimeOffPolicy {
  const { policy, settings } = policyOf(current, id);
  if (settings.everUsed) {
    throw new ApplicationError("CONFLICT", "This policy is in use, so it can't be deleted.");
  }
  return policy;
}

function planEdit(
  current: CurrentTimeOffType,
  change: ParsedTimeOffTypeUpdate["policies"][number],
  index: number,
  errors: FieldError[],
): PolicyEdit {
  const { policy, settings } = policyOf(current, change.id);
  if (change.balance && change.balance !== policy.balance && settings.everUsed) {
    throw new ApplicationError("CONFLICT", "This policy is in use, so how it counts can't change.");
  }
  const next = nextValues(settings, change, `policies.${index}`, errors);
  const grantChanged =
    next.balance !== policy.balance ||
    next.days !== (settings.allowance?.days ?? null) ||
    next.bankHolidays !== policy.bankHolidays;
  if (policy.key && grantChanged && next.name === policy.name) {
    // A standard policy that grants something else needs a name that says so.
    errors.push({ field: `policies.${index}.name`, code: "required" });
  }
  return { policy, next, grantChanged };
}

function policyOf(
  current: CurrentTimeOffType,
  id: string | null,
): { policy: TimeOffPolicy; settings: TimeOffPolicySettings } {
  const policy = current.policies.find((candidate) => candidate.id === id);
  const settings = current.settings.policies.find((candidate) => candidate.id === id);
  if (!policy || !settings) {
    throw new ApplicationError("NOT_FOUND", "The time off policy does not exist.");
  }
  return { policy, settings };
}

/** What a policy becomes: sent values over current ones; a balance needs days and bank holidays. */
function nextValues(
  current: Pick<TimeOffPolicySettings, "name" | "balance" | "allowance" | "leaveYear">,
  change: {
    name?: string;
    balance?: PolicyValues["balance"] | null;
    allowanceDays?: number | null;
    bankHolidays?: PolicyValues["bankHolidays"];
  },
  path: string,
  errors: FieldError[],
): PolicyEdit["next"] {
  const balance = change.balance ?? current.balance;
  const name = change.name ?? current.name;
  if (balance !== "balance_from_allowance") {
    const leaveYear = balance === "no_balance" ? null : (current.leaveYear ?? FIRST_OF_JANUARY);
    return { name, balance, days: null, bankHolidays: null, leaveYear };
  }
  const days = change.allowanceDays ?? current.allowance?.days ?? null;
  const bankHolidays = change.bankHolidays ?? current.allowance?.bankHolidays ?? null;
  if (days === null) {
    errors.push({ field: `${path}.allowanceDays`, code: "required" });
  }
  if (bankHolidays === null) {
    errors.push({ field: `${path}.bankHolidays`, code: "required" });
  }
  return { name, balance, days, bankHolidays, leaveYear: current.leaveYear ?? FIRST_OF_JANUARY };
}

/** Policy names stay unique within the type, ignoring case, after the save. */
function checkPolicyNames(
  current: CurrentTimeOffType,
  { edits, adds, deletes }: Pick<UpdatePlan, "edits" | "adds" | "deletes">,
  save: ParsedTimeOffTypeUpdate,
  errors: FieldError[],
): void {
  const touched = new Set(
    [...edits, ...deletes.map((policy) => ({ policy }))].map(({ policy }) => policy.id),
  );
  const kept = [
    ...current.policies.filter(({ id }) => !touched.has(id)).map(({ name }) => name),
    // A standard policy that grants something else leaves a copy under its old name.
    ...edits
      .filter(({ policy, grantChanged }) => policy.key && grantChanged)
      .map(({ policy }) => policy.name),
  ];
  const named = [
    ...edits.map(({ next }, index) => ({
      name: next.name,
      field: `policies.${index}.name`,
      sent: save.policies[index]!.name,
    })),
    ...adds.map(({ name }, index) => ({ name, field: `addPolicies.${index}.name`, sent: name })),
  ];
  named.forEach(({ name, field, sent }, index) => {
    const others = [
      ...kept,
      ...named.filter((_, other) => other !== index).map((entry) => entry.name),
    ];
    if (sent !== undefined && sameName(others, name)) {
      errors.push({ field, code: "taken" });
    }
  });
}

/** One save changes a policy at most once. */
function checkEachPolicyOnce(save: ParsedTimeOffTypeUpdate, errors: FieldError[]): void {
  save.policies.forEach(({ id }, index) => {
    if (save.policies.findIndex((other) => other.id === id) < index) {
      errors.push({ field: `policies.${index}.id`, code: "invalid" });
    }
  });
}

function sameName(names: readonly string[], name: string): boolean {
  const key = name.trim().toLowerCase();
  return names.some((other) => other.trim().toLowerCase() === key);
}

/** The start of a new policy's leave year, as the standard policies have it. */
const FIRST_OF_JANUARY = { kind: "leave_year_from_fixed_date", month: 1, day: 1 } as const;
