import { ApplicationError } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { addDays, type CalendarDate, parseUuid, todayInLondon } from "../../../utils";
import {
  cancelOwnChange,
  createEmployeeReadService,
  type EmployeeReadService,
  employeeNotFound,
  type OwnStretch,
  ownStretchOn,
  parseDateField,
  parsePersonChangeDate,
  withOwnStretch,
  withoutOwnStretches,
} from "../../employees";
import { timeOffPolicyRepository } from "../db";
import {
  type NewPolicyVersion,
  parseRules,
  refuseCountsChangesMidYear,
  rulesOfVersion,
  type TimeOffRulesInput,
  type TimeOffType,
  versionFromRules,
} from "../domain";
import { readPeople } from "./allowanceEngine";
import { readOwnRules, saveOwnRules } from "./ownRulesStore";
import { existingType, rulesChanged } from "./policyRules";
import type { TimeOffService } from "./timeOffService";

/**
 * A person's own rules for one time off type on top of their terms: set or changed from a date,
 * given back to the terms from a date, and a change that has not started cancelled. Each keeps
 * the person's allowances and adds a line to their history. Admins only.
 */
export interface OwnTimeOffRulesService {
  /**
   * The person's own rules for the type from `startDate`, until their next own rules or
   * open-ended; how the type counts changes only from the start of a leave year.
   */
  setOwnRules: (
    ctx: SecurityContext,
    input: OwnRulesInput & { rules: TimeOffRulesInput },
  ) => Promise<void>;
  /** Their terms' rules for the type from `startDate`: own rules covering it end the day before, later ones go. */
  useTermsRules: (ctx: SecurityContext, input: OwnRulesInput) => Promise<void>;
  /**
   * Removes an own-rules change starting on `startDate` after today: new own rules, a change to
   * them, or a return to the terms. CONFLICT otherwise.
   */
  cancelOwnRulesChange: (ctx: SecurityContext, input: OwnRulesInput) => Promise<void>;
}

/** Which person's own rules for which type, from when. */
export interface OwnRulesInput {
  employeeId: string;
  timeOffTypeId: string;
  startDate: string;
}

export function createOwnTimeOffRulesService({
  orm,
  transact,
  logger,
  timeOff,
  today = todayInLondon,
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  today?: () => CalendarDate;
}): OwnTimeOffRulesService {
  const dependencies = {
    transact,
    today,
    timeOff,
    employeeReads: createEmployeeReadService({ orm }),
  };
  return {
    async setOwnRules(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const rules = parseRules(input.rules);
      const changed = await changeOwnRules(
        dependencies,
        ctx,
        input,
        ({ stretches, from, onDate }) => {
          const before = ownStretchOn(stretches, from)?.value ?? null;
          const after = versionFromRules(rules, onDate);
          return { stretches: withOwnStretch(stretches, from, after), before, after };
        },
      );
      logger.info(changed, "Set own time off rules");
    },

    async useTermsRules(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const changed = await changeOwnRules(dependencies, ctx, input, ({ stretches, from }) => ({
        stretches: withoutOwnStretches(stretches, from),
        before:
          (ownStretchOn(stretches, from) ?? stretches.find(({ startDate }) => startDate > from))
            ?.value ?? null,
        after: null,
      }));
      logger.info(changed, "Put a person back on the terms' rules");
    },

    async cancelOwnRulesChange(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const changed = await changeOwnRules(
        dependencies,
        ctx,
        input,
        ({ stretches, from }) => {
          const { stretches: kept, cancelled } = cancelOwnChange(stretches, from, today());
          return { stretches: kept, before: cancelled, cancelled: true };
        },
        { cancel: true },
      );
      logger.info(changed, "Cancelled an own time off rules change");
    },
  };
}

/** What own-rules changes need: their transaction, the people they read and the allowance engine. */
interface Dependencies {
  transact: Transact;
  today: () => CalendarDate;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  employeeReads: EmployeeReadService;
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
  { transact, today, timeOff, employeeReads }: Dependencies,
  ctx: SecurityContext,
  input: OwnRulesInput,
  apply: (start: ChangeStart) => Applied,
  { cancel = false } = {},
) {
  const employeeId = parseUuid(input.employeeId);
  if (!employeeId) throw employeeNotFound();
  return transact(async (tx) => {
    await timeOffPolicyRepository(tx).lockPolicies();
    const { timeOffType, from } = await parseChange(
      { employeeReads, today: today() },
      tx,
      { ...input, employeeId },
      cancel,
    );
    const lane = { employeeId, timeOffTypeId: timeOffType.id };
    const { stretches, versions } = await readOwnRules(tx, lane);
    const timeline = await timelineOf(employeeReads, tx, employeeId, timeOffType);
    const onDate = timeline.getVersionOnDate(from);
    const applied = apply({ stretches, from, onDate });
    const timeOffPolicyId = await saveOwnRules(tx, lane, versions, applied.stretches);
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
 * The type and date a change is for: refuses an unknown person or type, and a date before this
 * leave year or the person's start, or after they leave; a cancel names any date.
 */
async function parseChange(
  { employeeReads, today }: { employeeReads: EmployeeReadService; today: CalendarDate },
  tx: Tx,
  input: OwnRulesInput,
  cancel: boolean,
): Promise<{ timeOffType: TimeOffType; from: CalendarDate }> {
  if ((await employeeReads.readEmployeesByName(tx, [input.employeeId])).length === 0) {
    throw employeeNotFound();
  }
  const types = await timeOffPolicyRepository(tx).findAllTypes();
  const timeOffType = existingType(types, input.timeOffTypeId);
  if (cancel) return { timeOffType, from: parseDateField("startDate", input.startDate) };
  const periods = await employeeReads.readEmploymentPeriods(tx, [input.employeeId]);
  return {
    timeOffType,
    from: parsePersonChangeDate(input.startDate, today, periods.get(input.employeeId) ?? []),
  };
}

/**
 * Refuses, on `rules.balance` (CONFLICT for a cancel), rules that now count the type differently
 * from the day before partway through a leave year, where the person's own rules start or end.
 * Days before the person starts are not rules before.
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
  const [person] = (await readPeople(employeeReads, tx, [employeeId])).people;
  const dayBefore = addDays(from, -1);
  const start = person!.serviceStart;
  const rows = person!
    .timelineOf(timeOffType.id)
    .getVersions(start && start > dayBefore ? start : dayBefore, LAST_DATE)
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

const LAST_DATE = "9999-12-31" as CalendarDate;
