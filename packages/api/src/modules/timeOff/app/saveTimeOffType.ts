import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { createRecordHistoryService, type FieldChange } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import {
  timeOffPolicyRepository,
  timeOffSettingsRepository,
  type TimeOffSettingsRepository,
} from "../db";
import {
  parseSaveTimeOffType,
  type SaveTimeOffTypeInput,
  timeOffPolicyChanges,
  type TimeOffPolicy,
  type TimeOffPolicyFields,
  type TimeOffType,
  timeOffTypeChanges,
} from "../domain";
import { type AllowanceEngineDependencies, ensureAllowancesOf } from "./allowanceEngine";
import {
  readOneTypeSettings,
  type TimeOffTypeSettings,
  type TimeOffTypeSettingsDependencies,
} from "./timeOffTypeSettings";
import {
  type CurrentTimeOffType,
  type PolicyEdit,
  planSave,
  type SavePlan,
} from "./planTimeOffTypeSave";

/** What a save left: the type as Settings now shows it, and how many allowances moved. */
export interface SavedTimeOffType {
  timeOffType: TimeOffTypeSettings;
  /** Allowances that got lines because a policy changed. */
  allowancesUpdated: number;
}

export type SaveTimeOffTypeDependencies = TimeOffTypeSettingsDependencies & {
  engine: AllowanceEngineDependencies;
};

const history = createRecordHistoryService();

/** The working week a new allowance is stated for. */
const FIVE_DAY_WEEK = 5;

/**
 * Saves a time off type's panel in one transaction: its fields, changed, added and deleted
 * policies, their history, and the allowances of everyone on a changed policy.
 */
export async function saveTimeOffType(
  dependencies: SaveTimeOffTypeDependencies,
  ctx: SecurityContext,
  input: SaveTimeOffTypeInput,
): Promise<SavedTimeOffType> {
  ctx.require("MANAGE_WORKSPACE");
  const save = parseSaveTimeOffType(input);
  return dependencies.transact(async (tx) => {
    await timeOffPolicyRepository(tx).lockTermsLinks();
    const current = await readCurrent(dependencies, tx, save.id);
    const plan = planSave(current, save);
    const changes = await writeSave(tx, current, plan);
    await appendHistory(ctx, tx, current.type.id, changes);
    await updateAllowances(dependencies, tx, plan.edits);
    const allowancesUpdated =
      await timeOffSettingsRepository(tx).countAllowancesChangedInTransaction();
    tx.publish("timeOff.time_off_type_saved", {
      timeOffTypeId: current.type.id,
      fields: changes.type.map(({ field }) => field),
      changedPolicyIds: plan.edits.map(({ policy }) => policy.id),
      addedPolicyIds: changes.addedPolicyIds,
      deletedPolicyIds: plan.deletes.map(({ id }) => id),
      allowancesUpdated,
    });
    const timeOffType = (await readOneTypeSettings(dependencies, tx, current.type.id))!;
    return { timeOffType, allowancesUpdated };
  });
}

async function readCurrent(
  dependencies: TimeOffTypeSettingsDependencies,
  tx: Tx,
  timeOffTypeId: string | null,
): Promise<CurrentTimeOffType> {
  const settings = timeOffTypeId && (await readOneTypeSettings(dependencies, tx, timeOffTypeId));
  if (!settings) {
    throw new ApplicationError("NOT_FOUND", "The time off type does not exist.");
  }
  const repository = timeOffPolicyRepository(tx);
  const [policies, types] = await Promise.all([repository.findAll(), repository.findAllTypes()]);
  return {
    type: settings.timeOffType,
    settings,
    policies: policies.filter(({ timeOffType }) => timeOffType.id === timeOffTypeId),
    otherTypeNames: types.filter(({ id }) => id !== timeOffTypeId).map(({ name }) => name),
  };
}

/** The history field changes the save makes, by what they belong to. */
interface SaveChanges {
  type: FieldChange[];
  policies: FieldChange[][];
  addedPolicyIds: string[];
}

async function writeSave(
  tx: Tx,
  current: CurrentTimeOffType,
  plan: SavePlan,
): Promise<SaveChanges> {
  const repository = timeOffSettingsRepository(tx);
  await repository.updateType(current.type.id, plan.typeFields);
  const policies: FieldChange[][] = [];
  for (const policy of plan.deletes) {
    await repository.deletePolicy(policy.id);
    policies.push(policyLine(policy.id, fieldsOf(policy), null));
  }
  for (const edit of plan.edits) {
    await writeEdit(repository, edit);
    policies.push(policyLine(edit.policy.id, fieldsOf(edit.policy), fieldsOfValues(edit.next)));
  }
  const addedPolicyIds: string[] = [];
  for (const values of plan.adds) {
    const { name, balance, bankHolidays, leaveYear } = values;
    const id = await repository.insertPolicy(current.type.id, {
      name,
      balance,
      bankHolidays,
      leaveYear,
    });
    if (values.days !== null) {
      await repository.insertYearlyEntitlement(id, {
        entitlementDays: values.days,
        entitlementDaysPerWeek: FIVE_DAY_WEEK,
        maxDays: null,
      });
    }
    addedPolicyIds.push(id);
    policies.push(policyLine(id, null, fieldsOfValues(values)));
  }
  return { type: typeChanges(current.type, plan.typeFields), policies, addedPolicyIds };
}

/**
 * Applies one policy change. A standard policy that grants something else becomes the company's
 * own, and a fresh copy keeps the standard; a changed amount replaces the yearly rule.
 */
async function writeEdit(
  repository: TimeOffSettingsRepository,
  { policy, next, grantChanged }: PolicyEdit,
) {
  const becomesOwn = policy.key !== null && grantChanged;
  const { days, ...values } = next;
  // Its key and old name are freed first, so the standard copy can take them.
  await repository.updatePolicy(policy.id, becomesOwn ? { ...values, key: null } : values);
  if (becomesOwn) {
    const { name, key, balance, bankHolidays, leaveYear } = policy;
    const copyId = await repository.insertPolicy(policy.timeOffType.id, {
      name,
      key,
      balance,
      bankHolidays,
      leaveYear,
    });
    await repository.insertRules(copyId, policy.rules);
  }
  const yearly = policy.rules.find((rule) => rule.kind === "yearly_entitlement");
  if ((yearly?.entitlementDays ?? null) === days) {
    return;
  }
  await repository.removeYearlyEntitlement(policy.id);
  if (days !== null) {
    await repository.insertYearlyEntitlement(policy.id, {
      entitlementDays: days,
      entitlementDaysPerWeek: yearly?.entitlementDaysPerWeek ?? FIVE_DAY_WEEK,
      // The cap is the statutory rule; a standard policy that grants something else drops it.
      maxDays: policy.key ? null : (yearly?.maxDays ?? null),
    });
  }
}

function typeChanges(type: TimeOffType, fields: SavePlan["typeFields"]): FieldChange[] {
  const before = {
    name: type.name,
    icon: type.icon,
    colour: type.colour,
    reasonVisibleToColleagues: !type.private,
  };
  return timeOffTypeChanges(before, {
    name: fields.name ?? before.name,
    icon: fields.icon ?? before.icon,
    colour: fields.colour ?? before.colour,
    reasonVisibleToColleagues:
      fields.private === undefined ? before.reasonVisibleToColleagues : !fields.private,
  });
}

/** One policy's history changes, led by the policy it is about, labelled with its names. */
function policyLine(
  policyId: string,
  before: TimeOffPolicyFields | null,
  after: TimeOffPolicyFields | null,
): FieldChange[] {
  const fields = timeOffPolicyChanges(before, after);
  if (fields.length === 0) {
    return [];
  }
  return [
    {
      field: "policy",
      oldValue: before && policyId,
      newValue: after && policyId,
      oldLabel: before?.policyName ?? null,
      newLabel: after?.policyName ?? null,
    },
    ...fields,
  ];
}

function fieldsOf(policy: TimeOffPolicy): TimeOffPolicyFields {
  const yearly = policy.rules.find((rule) => rule.kind === "yearly_entitlement");
  return {
    policyName: policy.name,
    policyBalance: policy.balance,
    allowanceDays: yearly?.entitlementDays ?? null,
    bankHolidays: policy.bankHolidays,
  };
}

function fieldsOfValues(values: PolicyEdit["next"]): TimeOffPolicyFields {
  return {
    policyName: values.name,
    policyBalance: values.balance,
    allowanceDays: values.days,
    bankHolidays: values.bankHolidays,
  };
}

async function appendHistory(
  ctx: SecurityContext,
  tx: Tx,
  timeOffTypeId: string,
  changes: SaveChanges,
): Promise<void> {
  const lines = [changes.type, ...changes.policies].filter((line) => line.length > 0);
  for (const line of lines) {
    await history.append(ctx, tx, {
      recordType: "time_off_type",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [{ recordId: timeOffTypeId, changes: line }],
    });
  }
}

/** Runs the engine for everyone ever on a policy whose grant changed. */
async function updateAllowances(
  dependencies: SaveTimeOffTypeDependencies,
  tx: Tx,
  edits: readonly PolicyEdit[],
): Promise<void> {
  for (const { policy } of edits.filter(({ grantChanged }) => grantChanged)) {
    const employeeIds = await employeesEverOn(dependencies, tx, policy.id);
    await ensureAllowancesOf(dependencies.engine, tx, {
      employeeIds,
      cause: { kind: "POLICY_CHANGED", ref: policy.id },
    });
  }
}

/** Everyone on any terms ever linked to the policy, or ever assigned it. */
async function employeesEverOn(
  { employeeReads }: TimeOffTypeSettingsDependencies,
  tx: Tx,
  policyId: string,
): Promise<string[]> {
  const repository = timeOffPolicyRepository(tx);
  const [links, assignments] = await Promise.all([
    repository.findLinksOfPolicies([policyId]),
    repository.findAssignmentsOfPolicies([policyId]),
  ]);
  const terms = await employeeReads.readTerms(tx, [
    ...new Set(links.map(({ termsId }) => termsId)),
  ]);
  return [
    ...new Set([
      ...terms.flatMap(({ memberIds }) => memberIds),
      ...assignments.map(({ employeeId }) => employeeId),
    ]),
  ];
}
