import { asc, eq } from "drizzle-orm";

import type { Orm, Transact, Tx } from "../../src/core/db";
import type { SecurityContext } from "../../src/core/security";
import { createLogger } from "../../src/core/logger";
import { createTimeOffService } from "../../src/modules/timeOff";
import {
  allowanceLedgerLines,
  allowances,
  timeOffAllowanceRules,
  timeOffTypes,
} from "../../src/modules/timeOff/db";
import { type CalendarDate } from "../../src/utils";
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

/** Links the UK statutory minimum to the "Everyone" group, as an admin would. */
export async function linkStatutoryMinimumToEveryone(orm: Orm, seed: TestSeed, transact: Transact) {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    ({ key }) => key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
}

/** Deletes every employee and the groups' time off policies, as startup composes it. */
export function deleteAllEmployees(orm: Orm) {
  const timeOff = timeOffService(orm);
  return async (ctx: SecurityContext, tx: Tx) => {
    // Links first: linking holds their lock while its allowances wait on employee rows.
    await timeOff.deleteAllGroupPolicies(ctx, tx);
    await employeeSetup.deleteAllEmployees(ctx, tx);
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
