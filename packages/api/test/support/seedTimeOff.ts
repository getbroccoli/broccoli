import { sql } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { timeOffAllowanceRules, timeOffTypes } from "../../src/modules/timeOff/db";

// These fixture writes use SQL because the tables have no exported write operations yet.
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
    .values({
      name: input.name,
      needsApproval: true,
      private: false,
    })
    .returning({ id: timeOffTypes.id });
  const policy = await orm.execute<{ id: string }>(sql`
    insert into time_off_policies
      (time_off_type_id, name, balance, bank_holidays, leave_year_start, leave_year_start_month, leave_year_start_day)
    values (${type!.id}, ${input.name}, ${input.balance},
      ${input.balance === "balance_from_allowance" ? "bank_holidays_on_top_of_allowance" : null},
      'leave_year_from_fixed_date', 1, 1)
    returning id
  `);
  const id = policy.rows[0]!.id;
  if (input.entitlementDays !== undefined) {
    await orm.insert(timeOffAllowanceRules).values({
      timeOffPolicyId: id,
      kind: "yearly_entitlement",
      entitlementDays: String(input.entitlementDays),
      entitlementDaysPerWeek: 5,
    });
  }
  return { id, timeOffTypeId: type!.id };
}

export async function seedTimeOffAssignment(
  orm: Orm,
  input: { employeeId: string; timeOffTypeId: string; timeOffPolicyId: string },
): Promise<void> {
  await orm.execute(sql`
    insert into time_off_policy_assignments
      (employee_id, time_off_type_id, time_off_policy_id, effective_from)
    values (${input.employeeId}, ${input.timeOffTypeId}, ${input.timeOffPolicyId}, '2025-01-01')
  `);
}

export async function seedEmploymentEnd(
  orm: Orm,
  employeeId: string,
  endDate: string,
): Promise<void> {
  await orm.execute(
    sql`update employments set end_date = ${endDate} where employee_id = ${employeeId}`,
  );
}

export async function seedTimeOff(
  orm: Orm,
  input: {
    employeeId: string;
    timeOffTypeId: string;
    status: "approved" | "pending_approval" | "declined" | "cancelled";
    days: { date: string; dayPart: "full_day" | "morning" | "afternoon" }[];
  },
): Promise<void> {
  const saved = await orm.execute<{ id: string }>(sql`
    insert into time_off (employee_id, time_off_type_id, status)
    values (${input.employeeId}, ${input.timeOffTypeId}, ${input.status}) returning id
  `);
  for (const day of input.days) {
    await orm.execute(sql`
      insert into time_off_days (time_off_id, date, day_part)
      values (${saved.rows[0]!.id}, ${day.date}, ${day.dayPart})
    `);
  }
}
