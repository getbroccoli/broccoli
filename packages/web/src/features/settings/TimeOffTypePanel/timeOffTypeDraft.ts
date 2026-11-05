import type {
  TimeOffBalanceKind,
  TimeOffTypeColour,
  TimeOffTypeIcon,
  TimeOffTypePanel_TypeFragment,
  TimeOffTypeUpdateInput,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

/** One policy as the panel edits it; `id` is null for a policy added in this panel. */
export interface PolicyDraft {
  /** Stable while editing, also for a new policy. */
  key: string;
  id: string | null;
  name: string;
  /** One of Broccoli's standard leave policies, as saved. */
  standard: boolean;
  /** Ever on terms or given to someone: how it counts is then fixed, and it can't be deleted. */
  everUsed: boolean;
  balance: TimeOffBalanceKind;
  /** As typed, so a half-typed number stays in the field. */
  days: string;
  bankHolidaysOnTop: boolean;
  deleted: boolean;
}

/** The whole panel as edited. */
export interface TypeDraft {
  name: string;
  icon: TimeOffTypeIcon;
  colour: TimeOffTypeColour;
  reasonVisibleToColleagues: boolean;
  policies: PolicyDraft[];
}

/** A save to send, and which draft policy each input entry came from, to place field errors. */
export interface PreparedSave {
  input: TimeOffTypeUpdateInput;
  policyKeys: string[];
  addedKeys: string[];
}

type SavedType = TimeOffTypePanel_TypeFragment;

/** The draft of a saved type: what the panel starts from and returns to on Cancel. */
export function draftOf({ timeOffType, policies }: SavedType): TypeDraft {
  return {
    name: timeOffType.name,
    icon: timeOffType.icon,
    colour: timeOffType.colour,
    reasonVisibleToColleagues: timeOffType.reasonVisibleToColleagues,
    policies: policies.map((policy) => ({
      key: policy.id,
      id: policy.id,
      name: policy.name,
      standard: policy.standard,
      everUsed: policy.everUsed,
      balance: policy.balance,
      days: policy.allowance ? String(policy.allowance.days) : "",
      bankHolidaysOnTop: policy.allowance?.bankHolidays !== "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE",
      deleted: false,
    })),
  };
}

/** A new policy as Add policy starts it: record-only types copy their only kind, the rest 20 days on top. */
export function newPolicyDraft(type: SavedType, key: string): PolicyDraft {
  const recordOnly =
    type.policies.length > 0 && type.policies.every(({ balance }) => balance === "NO_BALANCE");
  return {
    key,
    id: null,
    name: "",
    standard: false,
    everUsed: false,
    balance: recordOnly ? "NO_BALANCE" : "BALANCE_FROM_ALLOWANCE",
    days: recordOnly ? "" : "20",
    bankHolidaysOnTop: true,
    deleted: false,
  };
}

/** The draft with one policy changed; a standard policy that now grants something else is renamed to say so. */
export function withPolicyEdited(
  saved: TypeDraft,
  draft: TypeDraft,
  key: string,
  fields: Partial<PolicyDraft>,
): TypeDraft {
  return {
    ...draft,
    policies: draft.policies.map((policy) =>
      policy.key === key ? withSuggestedName(saved, policy, { ...policy, ...fields }) : policy,
    ),
  };
}

/** The draft without a policy: a new one disappears, a saved one is marked for deletion. */
export function withPolicyRemoved(draft: TypeDraft, key: string): TypeDraft {
  return {
    ...draft,
    policies: draft.policies.flatMap((policy) =>
      policy.key !== key ? [policy] : policy.id ? [{ ...policy, deleted: true }] : [],
    ),
  };
}

/** A standard policy's name follows what it grants until someone types one. */
function withSuggestedName(saved: TypeDraft, before: PolicyDraft, after: PolicyDraft): PolicyDraft {
  const original = saved.policies.find(({ key }) => key === after.key);
  if (!original?.standard || after.name !== before.name) return after;
  const nameUntouched = before.name === original.name || before.name === suggestedName(before);
  if (!nameUntouched) return after;
  return { ...after, name: grantChanged(original, after) ? suggestedName(after) : original.name };
}

/** The name a standard policy is offered once it grants something else. */
export function suggestedName({ days, bankHolidaysOnTop }: PolicyDraft): string {
  return t(
    bankHolidaysOnTop ? "settings.timeOffType.nameOnTop" : "settings.timeOffType.nameIncluded",
    {
      days,
    },
  );
}

/** Whether a saved policy's grant differs in the draft: how it counts, its days or its bank holidays. */
export function grantChanged(saved: PolicyDraft, draft: PolicyDraft): boolean {
  return (
    saved.balance !== draft.balance ||
    (draft.balance === "BALANCE_FROM_ALLOWANCE" &&
      (Number(saved.days) !== Number(draft.days) ||
        saved.bankHolidaysOnTop !== draft.bankHolidaysOnTop))
  );
}

/** How many things differ from the saved type, for the discard question. */
export function changeCount(saved: TypeDraft, draft: TypeDraft): number {
  const typeFields = (["name", "icon", "colour", "reasonVisibleToColleagues"] as const).filter(
    (field) => saved[field] !== draft[field],
  ).length;
  const policies = draft.policies.filter((policy) => {
    const before = saved.policies.find(({ key }) => key === policy.key);
    return !before || policy.deleted || before.name !== policy.name || grantChanged(before, policy);
  }).length;
  return typeFields + policies;
}

/** What the panel refuses before sending: an allowance that is blank, not a whole or half day from 0 to 366, or a new policy without a name. */
export function draftErrors(draft: TypeDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const policy of draft.policies.filter(({ deleted }) => !deleted)) {
    if (policy.balance === "BALANCE_FROM_ALLOWANCE" && parseDays(policy.days) === null) {
      errors[`${policy.key}.allowanceDays`] = policy.days.trim() === "" ? "required" : "invalid";
    }
    if (policy.id === null && policy.name.trim() === "") {
      errors[`${policy.key}.name`] = "required";
    }
  }
  return errors;
}

/** Typed days as a number: whole or half days from 0 to 366; null for anything else. */
function parseDays(text: string): number | null {
  const days = Number(text);
  return text.trim() !== "" && days >= 0 && days <= MAX_ALLOWANCE_DAYS && Number.isInteger(days * 2)
    ? days
    : null;
}

/** Only what changed, as the API takes it; null when nothing did. */
export function prepareSave(id: string, saved: TypeDraft, draft: TypeDraft): PreparedSave | null {
  const changed = draft.policies.flatMap((policy) => {
    const before = saved.policies.find(({ key }) => key === policy.key);
    return before && policy.id && !policy.deleted
      ? [policyChange(before, policy)].filter(Boolean)
      : [];
  }) as { key: string; change: NonNullable<TimeOffTypeUpdateInput["policies"]>[number] }[];
  const added = draft.policies.filter(({ id: policyId, deleted }) => policyId === null && !deleted);
  const deleted = draft.policies.filter(({ id: policyId, deleted: gone }) => policyId && gone);
  const input: TimeOffTypeUpdateInput = {
    id,
    ...(saved.name !== draft.name && { name: draft.name }),
    ...(saved.icon !== draft.icon && { icon: draft.icon }),
    ...(saved.colour !== draft.colour && { colour: draft.colour }),
    ...(saved.reasonVisibleToColleagues !== draft.reasonVisibleToColleagues && {
      reasonVisibleToColleagues: draft.reasonVisibleToColleagues,
    }),
    ...(changed.length > 0 && { policies: changed.map(({ change }) => change) }),
    ...(added.length > 0 && { addPolicies: added.map(newPolicyInput) }),
    ...(deleted.length > 0 && { deletePolicyIds: deleted.map(({ id: policyId }) => policyId!) }),
  };
  return Object.keys(input).length === 1
    ? null
    : { input, policyKeys: changed.map(({ key }) => key), addedKeys: added.map(({ key }) => key) };
}

function policyChange(before: PolicyDraft, draft: PolicyDraft) {
  const grant = grantChanged(before, draft);
  if (!grant && before.name === draft.name) return null;
  const nowCounts = draft.balance === "BALANCE_FROM_ALLOWANCE";
  const { allowanceDays, bankHolidays } = allowanceOf(draft);
  // Only what changed is sent, so a save never overwrites another admin's change to another field.
  const startsCounting = nowCounts && before.balance !== draft.balance;
  return {
    key: draft.key,
    change: {
      id: draft.id!,
      ...(before.name !== draft.name && { name: draft.name }),
      ...(before.balance !== draft.balance && { balance: draft.balance }),
      ...(nowCounts &&
        (startsCounting || Number(before.days) !== allowanceDays) && { allowanceDays }),
      ...(nowCounts &&
        (startsCounting || before.bankHolidaysOnTop !== draft.bankHolidaysOnTop) && {
          bankHolidays,
        }),
    },
  };
}

function newPolicyInput(draft: PolicyDraft) {
  return {
    name: draft.name,
    balance: draft.balance,
    ...(draft.balance === "BALANCE_FROM_ALLOWANCE" && allowanceOf(draft)),
  };
}

/** A valid draft's allowance; `draftErrors` refuses the save before an invalid one gets here. */
function allowanceOf({ days, bankHolidaysOnTop }: PolicyDraft) {
  return {
    allowanceDays: parseDays(days) ?? 0,
    bankHolidays: bankHolidaysOnTop
      ? ("BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE" as const)
      : ("BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" as const),
  };
}

/** The most days a year an allowance can grant, as the API allows. */
const MAX_ALLOWANCE_DAYS = 366;
