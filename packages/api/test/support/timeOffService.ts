import { asc, eq } from "drizzle-orm";

import { type Orm, ormOf, type Transact, transactor, type Tx } from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import type { SecurityContext } from "../../src/core/security";
import { createLogger } from "../../src/core/logger";
import { createDemoFillService } from "../../src/modules/demo";
import { createTaskService } from "../../src/modules/tasks";
import {
  createBookTimeOffService,
  createOwnTimeOffRulesService,
  createTimeOffPolicyService,
  createTimeOffSetupService,
  createTimeOffService,
  createWhosOutService,
  timeOffModule,
} from "../../src/modules/timeOff";
import { employeeTerms } from "../../src/modules/employees/db";
import {
  allowanceLedgerLines,
  allowances,
  timeOffAllowanceRules,
  timeOffPolicyRepository,
  timeOffTypes,
} from "../../src/modules/timeOff/db";
import {
  type NewPolicyVersion,
  RECORD_ONLY_POLICY,
  STANDARD_LEAVE_POLICIES,
  type StandardLeavePolicyKey,
  type TimeOffTypeKey,
} from "../../src/modules/timeOff/domain";
import { type CalendarDate, coversDate } from "../../src/utils";
import { calendarDate } from "./calendarDate";
import { bankHolidayService } from "./bankHolidayService";
import { employeeSetup } from "./statelessServices";
import { OWNER } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";
import { testTransactor } from "./testTransactor";

/** The time off service on `orm` with the shipped bank holidays and silent logs; `today` is the engine's date. */
export function timeOffService(orm: Orm, { today = "2026-06-01" }: { today?: string } = {}) {
  return createTimeOffService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    bankHolidays: bankHolidayService(),
    today: () => today as CalendarDate,
  });
}

/** The booking service on `orm`, with the engine of `timeOffService`; `today` is its date. */
export function bookTimeOffService(orm: Orm, { today = "2026-11-09" }: { today?: string } = {}) {
  return createBookTimeOffService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    timeOff: timeOffService(orm, { today }),
    bankHolidays: bankHolidayService(),
    today: () => today as CalendarDate,
  });
}

/** The who's out service on `orm`; `today` is its date. */
export function whosOutService(orm: Orm, { today = "2026-11-09" }: { today?: string } = {}) {
  return createWhosOutService({
    orm,
    transact: testTransactor(orm),
    bankHolidays: bankHolidayService(),
    today: () => today as CalendarDate,
  });
}

/** The time off policy service on `orm`, with the engine of `timeOffService`; `today` is its date. */
export function timeOffPolicyService(
  orm: Orm,
  {
    today = "2026-06-01",
    transact = testTransactor(orm),
  }: { today?: string; transact?: Transact } = {},
) {
  return createTimeOffPolicyService({
    orm,
    transact,
    logger: createLogger("silent"),
    timeOff: timeOffService(orm, { today }),
    today: () => today as CalendarDate,
  });
}

/** The own time off rules service on `orm`, with the engine of `timeOffService`; `today` is its date. */
export function ownTimeOffRulesService(
  orm: Orm,
  { today = "2026-06-01" }: { today?: string } = {},
) {
  return createOwnTimeOffRulesService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    timeOff: timeOffService(orm, { today }),
    today: () => today as CalendarDate,
  });
}

/** A policy terms get: a standard Annual leave policy, a record-only one for a type, or any rules for a type. */
export type TermsPolicy =
  | { key: StandardLeavePolicyKey }
  | { recordOnly: TimeOffTypeKey }
  | { timeOffTypeId: string; version: NewPolicyVersion };

/**
 * Gives terms published policies from the current year's start and ensures their people's allowances, as
 * turning time off on does; `today` is the engine's date.
 */
export async function giveTermsPolicies(
  orm: Orm,
  transact: Transact,
  {
    termsId,
    policies,
    today,
  }: { termsId: string; policies: readonly TermsPolicy[]; today?: string },
) {
  const types = await orm.select().from(timeOffTypes);
  const typeId = (typeKey: TimeOffTypeKey) => types.find((type) => type.typeKey === typeKey)!.id;
  await transact(async (tx) => {
    for (const policy of policies) {
      const [timeOffTypeId, version] =
        "key" in policy
          ? [typeId("annual_leave"), STANDARD_LEAVE_POLICIES[policy.key]]
          : "recordOnly" in policy
            ? [typeId(policy.recordOnly), RECORD_ONLY_POLICY]
            : [policy.timeOffTypeId, policy.version];
      const repository = timeOffPolicyRepository(tx);
      const timeOffPolicyId = await repository.insertPolicy({ timeOffTypeId });
      const versionId = await repository.insertVersion(timeOffPolicyId, {
        ...version,
        status: "published",
      });
      await repository.insertAssignment({
        timeOffTypeId,
        timeOffPolicyId,
        versionId,
        owner: { termsId },
        startDate: calendarDate(`${(today ?? "2026-06-01").slice(0, 4)}-01-01`),
        endDate: null,
      });
    }
    const members = await ormOf(tx)
      .select({ employeeId: employeeTerms.employeeId })
      .from(employeeTerms)
      .where(eq(employeeTerms.termsId, termsId));
    await timeOffService(orm, { today }).ensureAllowances(OWNER, tx, {
      employeeIds: members.map(({ employeeId }) => employeeId),
      cause: { kind: "TIME_OFF_TURNED_ON", ref: null },
    });
  });
}

/** Gives "England and Wales" terms a copy of the UK statutory minimum, as turning time off on does. */
export async function giveDefaultTermsStatutoryMinimum(
  orm: Orm,
  seed: TestSeed,
  transact: Transact,
) {
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_statutory_minimum" }],
  });
}

/** A full-time employee started in 2025, with statutory Annual leave and 20 days remaining in 2026. */
export async function seedAnnualLeaveEmployee(orm: Orm, seed: TestSeed, transact: Transact) {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
  const annual = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "annual_leave",
  )!;
  return { employeeId: employee.id, timeOffTypeId: annual.id };
}

/** The published policies these terms use on the fixed test date. */
export async function readTermsPolicies(orm: Orm, termsId: string, today = "2026-06-01") {
  const repository = timeOffPolicyRepository(orm);
  const policies = await repository.findAll();
  const assignments = await repository.findAssignments({ termsIds: [termsId] });
  return assignments
    .filter((row) => coversDate(row, calendarDate(today)))
    .map((row) => {
      const policy = policies.find(({ id }) => id === row.timeOffPolicyId)!;
      const version = policy.versions.find(({ id }) => id === row.versionId)!;
      return {
        id: policy.id,
        timeOffTypeId: policy.timeOffType.id,
        versionId: version.id,
        typeKey: policy.timeOffType.typeKey,
        balance: version.balance,
        bankHolidays: version.bankHolidays,
        entitlementDays:
          version.rules.find((rule) => rule.kind === "yearly_entitlement")?.entitlementDays ?? null,
      };
    });
}

/** Policies assigned to these terms or holding their drafts, with every version. */
export async function readTermsPolicyVersions(orm: Orm, termsId: string) {
  const repository = timeOffPolicyRepository(orm);
  const policies = await repository.findAll();
  const assignments = await repository.findAssignments({ termsIds: [termsId] });
  return policies.filter(
    (policy) =>
      assignments.some((row) => row.timeOffPolicyId === policy.id) ||
      policy.versions.some((version) => version.termsId === termsId),
  );
}

/** The demo fill on `orm`, turning time off on for "England and Wales" terms. */
export function demoFillService(orm: Orm) {
  const tasks = createTaskService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
  });
  return createDemoFillService({ timeOff: timeOffService(orm), tasks });
}

/** Transactions on `orm` whose committed events reach time off's handlers, and no one else's. */
export function transactWithTimeOffEvents(orm: Orm): Transact {
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe(
    timeOffModule({
      orm,
      timeOff: timeOffService(orm),
      timeOffSetup: createTimeOffSetupService({
        logger: createLogger("silent"),
        decisions: { decide: () => Promise.reject(new Error("Unexpected model request")) },
        bankHolidays: bankHolidayService(),
      }),
      bankHolidays: bankHolidayService(),
      transact: testTransactor(orm),
      logger: createLogger("silent"),
    }).events!,
  );
  return transactor(orm, eventBus);
}

/** Deletes every employee and resets time off and tasks, as startup composes it. */
export function deleteAllEmployees(orm: Orm) {
  const timeOff = timeOffService(orm);
  const tasks = createTaskService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
  });
  return async (ctx: SecurityContext, tx: Tx) => {
    await timeOff.lockPolicies(ctx, tx);
    await employeeSetup.deleteAllEmployees(ctx, tx);
    await timeOff.resetTimeOff(ctx, tx);
    await tasks.resetTasks(ctx, tx);
  };
}

/** An employee's allowances, oldest first, each with its lines in the order they were appended (with their rule's kind) and their sum. */
export async function readAllowances(orm: Orm, employeeId: string) {
  const rows = await orm
    .select({ allowance: allowances, typeKey: timeOffTypes.typeKey })
    .from(allowances)
    .innerJoin(timeOffTypes, eq(timeOffTypes.id, allowances.timeOffTypeId))
    .where(eq(allowances.employeeId, employeeId))
    .orderBy(asc(allowances.leaveYearStart));
  return Promise.all(
    rows.map(async ({ allowance, typeKey }) => {
      const lines = await orm
        .select({
          kind: allowanceLedgerLines.kind,
          rule: timeOffAllowanceRules.kind,
          amount: allowanceLedgerLines.amount,
          effectiveDate: allowanceLedgerLines.effectiveDate,
          causeKind: allowanceLedgerLines.causeKind,
          causeRef: allowanceLedgerLines.causeRef,
        })
        .from(allowanceLedgerLines)
        .leftJoin(
          timeOffAllowanceRules,
          eq(timeOffAllowanceRules.id, allowanceLedgerLines.allowanceRuleId),
        )
        .where(eq(allowanceLedgerLines.allowanceId, allowance.id))
        // uuidv7 ids sort in insertion order.
        .orderBy(asc(allowanceLedgerLines.id));
      const parsed = lines.map((line) => ({ ...line, amount: Number(line.amount) }));
      return {
        typeKey,
        leaveYearStart: allowance.leaveYearStart,
        leaveYearEnd: allowance.leaveYearEnd,
        total: Math.round(parsed.reduce((sum, { amount }) => sum + amount, 0) * 1e6) / 1e6,
        lines: parsed,
      };
    }),
  );
}

/** A ledger line as `readAllowances` returns it. */
export type AllowanceLine = Awaited<ReturnType<typeof readAllowances>>[number]["lines"][number];
