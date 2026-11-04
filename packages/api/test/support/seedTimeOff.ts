import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { employments } from "../../src/modules/employees/db";
import {
  timeOff,
  timeOffAllowanceRules,
  timeOffDays,
  timeOffPolicies,
  timeOffPolicyAssignments,
  timeOffTypes,
} from "../../src/modules/timeOff/db";
import type { CalendarDate } from "../../src/utils";

/** A company's own time off type with one policy, its leave year from 1 January. */
export async function seedTimeOffPolicy(
  orm: Orm,
  input: {
    name: string;
    balance: "balance_from_allowance" | "unlimited_balance";
    entitlementDays?: number;
  },
): Promise<{ id: string; timeOffTypeId: string }> {
  const [type] = await orm
    .insert(timeOffTypes)
    .values({ name: input.name, needsApproval: true, private: false })
    .returning({ id: timeOffTypes.id });
  const [policy] = await orm
    .insert(timeOffPolicies)
    .values({
      timeOffTypeId: type!.id,
      name: input.name,
      balance: input.balance,
      bankHolidays:
        input.balance === "balance_from_allowance" ? "bank_holidays_on_top_of_allowance" : null,
      leaveYearStart: "leave_year_from_fixed_date",
      leaveYearStartMonth: 1,
      leaveYearStartDay: 1,
    })
    .returning({ id: timeOffPolicies.id });
  if (input.entitlementDays !== undefined) {
    await orm.insert(timeOffAllowanceRules).values({
      timeOffPolicyId: policy!.id,
      kind: "yearly_entitlement",
      entitlementDays: String(input.entitlementDays),
      entitlementDaysPerWeek: 5,
    });
  }
  return { id: policy!.id, timeOffTypeId: type!.id };
}

/** Puts one person on a policy from 1 January 2025, open-ended. */
export async function seedTimeOffAssignment(
  orm: Orm,
  input: { employeeId: string; timeOffTypeId: string; timeOffPolicyId: string },
): Promise<void> {
  await orm
    .insert(timeOffPolicyAssignments)
    .values({ ...input, effectiveFrom: "2025-01-01" as CalendarDate });
}

/** Ends the person's employment on `endDate`. */
export async function seedEmploymentEnd(
  orm: Orm,
  employeeId: string,
  endDate: string,
): Promise<void> {
  await orm
    .update(employments)
    .set({ endDate: endDate as CalendarDate })
    .where(eq(employments.employeeId, employeeId));
}

/** A person's time off with its days. */
export async function seedTimeOff(
  orm: Orm,
  input: {
    employeeId: string;
    timeOffTypeId: string;
    status: "approved" | "pending_approval" | "declined" | "cancelled";
    days: { date: string; dayPart: "full_day" | "morning" | "afternoon" }[];
  },
): Promise<void> {
  const [saved] = await orm
    .insert(timeOff)
    .values({
      employeeId: input.employeeId,
      timeOffTypeId: input.timeOffTypeId,
      status: input.status,
    })
    .returning({ id: timeOff.id });
  await orm.insert(timeOffDays).values(
    input.days.map((day) => ({
      timeOffId: saved!.id,
      date: day.date as CalendarDate,
      dayPart: day.dayPart,
    })),
  );
}
