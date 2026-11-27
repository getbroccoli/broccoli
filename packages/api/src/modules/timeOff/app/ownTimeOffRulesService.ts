import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Transact, Tx } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { ModuleDependencies } from "../../../core/moduleManifest";
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
  type TimeOffRulesInput,
  type TimeOffType,
  versionFromRules,
} from "../domain";
import { readPeople } from "./readPeople";
import { watchBookedTimeOff } from "./watchBookedTimeOff";
import { appendOwnRulesHistory } from "./ownRulesHistory";
import { NOT_OFFERED, type OwnRules, readOwnRules, saveOwnRules } from "./ownRulesStore";
import { existingType, rulesChanged } from "./policyRules";
import type { TimeOffService } from "./timeOffService";

/**
 * A person's own rules for one time off type on top of their terms: set or changed from a date,
 * the type stopped for them alone, given back to the terms from a date, and a change that has not
 * started cancelled. Each keeps the person's allowances and adds a line to their history. Admins
 * only.
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
  /**
   * Stops offering the type to the person from `startDate`, whether their terms or their own rules
   * offer it, until their next own change; INVALID_INPUT when nothing offers it then, CONFLICT
   * while that leaves their booked time off of the type without rules.
   */
  stopOffering: (ctx: SecurityContext, input: OwnRulesInput) => Promise<void>;
  /**
   * Their terms' rules for the type from `startDate`: own rules covering it end the day before,
   * later ones go. CONFLICT while that leaves their booked time off of the type without rules.
   */
  useTermsRules: (ctx: SecurityContext, input: OwnRulesInput) => Promise<void>;
  /**
   * Removes an own-rules change starting on `startDate` after today: new own rules, a change to
   * them, or a return to the terms. CONFLICT otherwise, or while that leaves their booked time
   * off of the type without rules.
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
    logger,
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

    async stopOffering(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const changed = await changeOwnRules(
        dependencies,
        ctx,
        input,
        ({ stretches, from, onDate }) => {
          if (!onDate) {
            throw invalidInput([{ field: "timeOffTypeId", code: "not_offered" }]);
          }
          return {
            stretches: withOwnStretch<OwnRules>(stretches, from, NOT_OFFERED),
            before: ownStretchOn(stretches, from)?.value ?? null,
            after: NOT_OFFERED,
          };
        },
      );
      logger.info(changed, "Stopped offering a time off type to a person");
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
  logger: Logger;
  today: () => CalendarDate;
  timeOff: Pick<TimeOffService, "ensureAllowances">;
  employeeReads: EmployeeReadService;
}

type Rules = OwnRules;

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
  onDate: NewPolicyVersion | null;
}

/**
 * Runs one own-rules change in a transaction: checks the person, type and date, saves the own
 * stretches `apply` leaves, refuses a change of how the type counts partway through a leave year,
 * adds the history line and works the person's allowances out again.
 */
async function changeOwnRules(
  { transact, logger, today, timeOff, employeeReads }: Dependencies,
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
    const refuseLostBookings = await watchBookedTimeOff(employeeReads, tx, {
      employeeIds: [employeeId],
      timeOffType,
      from,
    });
    const timeOffPolicyId = await saveOwnRules(tx, lane, versions, applied.stretches);
    await refuseCountsChangeFrom(employeeReads, tx, { employeeId, timeOffType, from, cancel });
    await refuseLostBookingsLogged(logger, refuseLostBookings, {
      employeeId,
      timeOffTypeId: timeOffType.id,
      startDate: from,
    });
    await appendOwnRulesHistory(ctx, tx, { employeeId, timeOffType, from, ...applied });
    const ensured = await timeOff.ensureAllowances(ctx, tx, {
      employeeIds: [employeeId],
      // A person with only stops has no policy of their own; the type names the rules changed.
      cause: rulesChanged(timeOffPolicyId ?? timeOffType.id, from),
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

/** Runs the booked time off check, logging a refusal with the change's ids before rethrowing it. */
async function refuseLostBookingsLogged(
  logger: Logger,
  refuseLostBookings: () => Promise<void>,
  change: { employeeId: string; timeOffTypeId: string; startDate: CalendarDate },
): Promise<void> {
  try {
    await refuseLostBookings();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "CONFLICT") {
      logger.info(
        change,
        "Refused an own time off rules change that leaves booked time off without rules",
      );
    }
    throw error;
  }
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

const LAST_DATE = "9999-12-31" as CalendarDate;
