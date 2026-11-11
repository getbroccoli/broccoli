import { ApplicationError } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid } from "../../../utils";
import {
  cancelOwnChange,
  type EmployeeReadService,
  employeeNotFound,
  type OwnStretch,
  ownStretchesOf,
  ownStretchOn,
  parseDateField,
  parsePersonChangeDate,
  withOwnStretch,
  withoutOwnStretches,
} from "../../employees";
import { type PolicyAssignment, timeOffPolicyRepository } from "../db";
import {
  type NewPolicyVersion,
  parseRules,
  refuseCountsChangesMidYear,
  rulesOfVersion,
  type TimeOffPolicy,
  type TimeOffRulesInput,
  type TimeOffType,
  versionFromRules,
} from "../domain";
import { readPeople } from "./allowanceEngine";
import { existingType, rulesChanged, versionOf } from "./policyRules";
import type { TimeOffService } from "./timeOffService";

/** Which person's own rules for which type, from when. */
export interface OwnRulesInput {
  employeeId: string;
  timeOffTypeId: string;
  startDate: string;
}

/** What own rules changes need: their transaction, the people they read and the allowance engine. */
export interface OwnRulesDependencies {
  transact: Transact;
  logger: Logger;
  today: () => CalendarDate;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  employeeReads: EmployeeReadService;
}

/** The person's own rules for the type from `startDate`, until their next own rules or open-ended. */
export async function setOwnRules(
  dependencies: OwnRulesDependencies,
  ctx: SecurityContext,
  input: OwnRulesInput & { rules: TimeOffRulesInput },
): Promise<void> {
  ctx.require("MANAGE_WORKSPACE");
  const rules = parseRules(input.rules);
  const changed = await changeOwnRules(dependencies, ctx, input, ({ stretches, from, onDate }) => {
    const before = ownStretchOn(stretches, from)?.value ?? null;
    const after = versionFromRules(rules, onDate);
    return { stretches: withOwnStretch(stretches, from, after), before, after };
  });
  dependencies.logger.info(changed, "Set own time off rules");
}

/** Their terms' rules for the type from `startDate`: own rules covering it end the day before, later ones go. */
export async function useTermsRules(
  dependencies: OwnRulesDependencies,
  ctx: SecurityContext,
  input: OwnRulesInput,
): Promise<void> {
  ctx.require("MANAGE_WORKSPACE");
  const changed = await changeOwnRules(dependencies, ctx, input, ({ stretches, from }) => ({
    stretches: withoutOwnStretches(stretches, from),
    before:
      (ownStretchOn(stretches, from) ?? stretches.find(({ startDate }) => startDate > from))
        ?.value ?? null,
    after: null,
  }));
  dependencies.logger.info(changed, "Put a person back on the terms' rules");
}

/**
 * Removes an own-rules change starting on `startDate` after today: new own rules, a change to them,
 * or a return to the terms. CONFLICT otherwise.
 */
export async function cancelOwnRulesChange(
  dependencies: OwnRulesDependencies,
  ctx: SecurityContext,
  input: OwnRulesInput,
): Promise<void> {
  ctx.require("MANAGE_WORKSPACE");
  const changed = await changeOwnRules(
    dependencies,
    ctx,
    input,
    ({ stretches, from }) => {
      const { stretches: kept, cancelled } = cancelOwnChange(stretches, from, dependencies.today());
      return { stretches: kept, before: cancelled, cancelled: true };
    },
    { cancel: true },
  );
  dependencies.logger.info(changed, "Cancelled an own time off rules change");
}

type Rules = NewPolicyVersion;

/** A change to a person's own rules for one type, and what its history line says it changed. */
interface Applied {
  stretches: OwnStretch<Rules>[];
  /** The rules on the date before the change; null: the terms'. */
  before: Rules | null;
  after?: Rules | null;
  /** A planned change cancelled, so the line has no new value. */
  cancelled?: boolean;
}

/** What a change starts from: the own stretches, the date, and the rules that apply on it today. */
interface ChangeStart {
  stretches: OwnStretch<Rules>[];
  from: CalendarDate;
  onDate: Rules | null;
}

/**
 * Runs one own-rules change in a transaction: checks the person, type and date, saves the own
 * stretches `apply` leaves, refuses a change of how the type counts partway through a leave year,
 * adds the history line and works the person's allowances out again.
 */
async function changeOwnRules(
  { transact, today, timeOff, employeeReads }: OwnRulesDependencies,
  ctx: SecurityContext,
  input: OwnRulesInput,
  apply: (start: ChangeStart) => Applied,
  { cancel = false } = {},
) {
  const employeeId = parseUuid(input.employeeId);
  if (!employeeId) throw employeeNotFound();
  return transact(async (tx) => {
    const repository = timeOffPolicyRepository(tx);
    await repository.lockPolicies();
    if ((await employeeReads.readEmployeesByName(tx, [employeeId])).length === 0) {
      throw employeeNotFound();
    }
    const timeOffType = existingType(await repository.findAllTypes(), input.timeOffTypeId);
    const periods = (await employeeReads.readEmploymentPeriods(tx, [employeeId])).get(employeeId);
    const from = cancel
      ? parseDateField("startDate", input.startDate)
      : parsePersonChangeDate(input.startDate, today(), periods ?? []);
    const policies = await repository.findAll();
    const rows = (await repository.findAssignments({ employeeIds: [employeeId] })).filter(
      (row) => row.timeOffTypeId === timeOffType.id,
    );
    const stretches = ownStretchesOf(rows, (id) => versionOf(policies, id));
    const onDate = (await timelineOf(employeeReads, tx, employeeId, timeOffType)).getVersionOnDate(
      from,
    );
    const applied = apply({ stretches, from, onDate });
    const timeOffPolicyId = await saveOwnRules(tx, {
      employeeId,
      timeOffType,
      policies,
      rows,
      stretches: applied.stretches,
    });
    await refuseCountsChangeFrom(employeeReads, tx, { employeeId, timeOffType, from, cancel });
    await appendOwnRulesHistory(ctx, tx, { employeeId, timeOffType, from, applied });
    const ensured = await timeOff.ensureAllowances(ctx, tx, {
      employeeIds: [employeeId],
      cause: rulesChanged(timeOffPolicyId, from),
    });
    return {
      employeeId,
      timeOffTypeId: timeOffType.id,
      timeOffPolicyId,
      startDate: from,
      ...ensured,
    };
  });
}

/**
 * Gives the person one assignment per own stretch for the type, in place of the ones they had: to
 * a version they already use with the same rules, else to a new published one under their own
 * policy for the type. Returns that policy's id.
 */
async function saveOwnRules(
  tx: Tx,
  {
    employeeId,
    timeOffType,
    policies,
    rows,
    stretches,
  }: {
    employeeId: string;
    timeOffType: TimeOffType;
    policies: readonly TimeOffPolicy[];
    rows: readonly PolicyAssignment[];
    stretches: readonly OwnStretch<Rules>[];
  },
): Promise<string> {
  const repository = timeOffPolicyRepository(tx);
  for (const { id } of rows) await repository.deleteAssignment(id);
  const saved = rows.map(({ versionId }) => versionOf(policies, versionId));
  let timeOffPolicyId = saved[0]?.timeOffPolicyId;
  for (const { startDate, endDate, value } of stretches) {
    let version = saved.find((candidate) => isSameRules(candidate, value));
    if (!version) {
      timeOffPolicyId ??= await repository.insertPolicy({ timeOffTypeId: timeOffType.id });
      const id = await repository.insertVersion(timeOffPolicyId, {
        ...value,
        status: "published",
      });
      version = versionOf(await repository.findAll(), id);
      saved.push(version);
    }
    await repository.insertAssignment({
      owner: { employeeId },
      versionId: version.id,
      timeOffPolicyId: version.timeOffPolicyId,
      timeOffTypeId: timeOffType.id,
      startDate,
      endDate,
    });
  }
  return timeOffPolicyId!;
}

/**
 * Refuses, on `rules.balance` (CONFLICT for a cancel), rules that now count the type differently
 * from the day before partway through a leave year, where the person's own rules start or end.
 */
async function refuseCountsChangeFrom(
  employeeReads: EmployeeReadService,
  tx: Tx,
  {
    employeeId,
    timeOffType,
    from,
    cancel,
  }: { employeeId: string; timeOffType: TimeOffType; from: CalendarDate; cancel: boolean },
) {
  const rows = (await timelineOf(employeeReads, tx, employeeId, timeOffType))
    .getVersions(addDays(from, -1), LAST_DATE)
    .map(({ version, source, startDate, endDate }) => ({
      balance: version.balance,
      source,
      startDate,
      endDate,
    }));
  try {
    refuseCountsChangesMidYear(rows, (row) => row.source === "their_own" || row.startDate === from);
  } catch (error) {
    if (!cancel) throw error;
    throw new ApplicationError(
      "CONFLICT",
      "Cancelling this change would change how the type counts partway through a leave year.",
    );
  }
}

/** The person's rules for the type over time, as stored now. */
async function timelineOf(
  employeeReads: EmployeeReadService,
  tx: Tx,
  employeeId: string,
  timeOffType: TimeOffType,
) {
  const { people } = await readPeople(employeeReads, tx, [employeeId]);
  return people[0]!.timelineOf(timeOffType.id);
}

const recordHistory = createRecordHistoryService();

/** The line in the person's history: their own rules before and after, each with the date. */
async function appendOwnRulesHistory(
  ctx: SecurityContext,
  tx: Tx,
  {
    employeeId,
    timeOffType,
    from,
    applied,
  }: { employeeId: string; timeOffType: TimeOffType; from: CalendarDate; applied: Applied },
) {
  await recordHistory.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: employeeId,
        changes: [
          {
            field: `timeOff.${timeOffType.id}`,
            oldValue: rulesValue(applied.before, from),
            newValue: applied.cancelled ? null : rulesValue(applied.after ?? null, from),
            oldLabel: timeOffType.name,
            newLabel: timeOffType.name,
          },
        ],
      },
    ],
  });
}

/** Rules as the line in history keeps them, with the date they apply from; null rules are the terms'. */
function rulesValue(rules: Rules | null, startDate: CalendarDate): string {
  return JSON.stringify({ startDate, rules: rules && rulesOfVersion(rules) });
}

function isSameRules(a: Rules, b: Rules): boolean {
  return JSON.stringify(rulesKey(a)) === JSON.stringify(rulesKey(b));
}

/** What makes two versions' rules the same, without their ids. */
function rulesKey({ balance, bankHolidays, leaveYear, rules }: Rules) {
  return {
    balance,
    bankHolidays,
    leaveYear,
    // Stored rules carry ids, new ones not; JSON leaves an undefined id out.
    rules: rules.map((rule) => ({ ...rule, id: undefined })),
  };
}

const LAST_DATE = "9999-12-31" as CalendarDate;
