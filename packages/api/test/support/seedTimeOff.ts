import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { employments } from "../../src/modules/employees/db";
import {
  timeOff,
  timeOffDays,
  timeOffPolicyAssignments,
  timeOffPolicyRepository,
  timeOffTypes,
} from "../../src/modules/timeOff/db";
import type { NewPolicyVersion } from "../../src/modules/timeOff/domain";
import type { CalendarDate } from "../../src/utils";

/** Ends a seeded policy's past version and adds its current and planned versions without history. */
export async function seedTimeOffPolicyVersions(
  orm: Orm,
  input: {
    policyId: string;
    past: { id: string; endDate: CalendarDate };
    versions: (NewPolicyVersion & { startDate: CalendarDate; endDate: CalendarDate | null })[];
  },
): Promise<void> {
  const repository = timeOffPolicyRepository(orm);
  await repository.endVersion(input.past.id, input.past.endDate);
  for (const version of input.versions) {
    await repository.insertVersion(input.policyId, version);
  }
}

/** A named policy on a new or existing type, from the beginning, its leave year from 1 January. */
export async function seedTimeOffPolicy(
  orm: Orm,
  input: {
    name: string;
    timeOffTypeId?: string;
    balance: "balance_from_allowance" | "unlimited_balance";
    entitlementDays?: number;
  },
): Promise<{ id: string; timeOffTypeId: string }> {
  const timeOffTypeId = input.timeOffTypeId ?? (await seedTimeOffType(orm, input.name)).id;
  const id = await timeOffPolicyRepository(orm).insertPolicy(
    { timeOffTypeId, name: input.name },
    {
      balance: input.balance,
      bankHolidays:
        input.balance === "balance_from_allowance" ? "bank_holidays_on_top_of_allowance" : null,
      leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
      rules:
        input.entitlementDays === undefined
          ? []
          : [
              {
                kind: "yearly_entitlement",
                entitlementDays: input.entitlementDays,
                entitlementDaysPerWeek: 5,
                maxDays: null,
              },
            ],
    },
  );
  return { id, timeOffTypeId };
}

/** A company's own time off type without a policy. */
export async function seedTimeOffType(orm: Orm, name: string): Promise<{ id: string }> {
  const [type] = await orm
    .insert(timeOffTypes)
    .values({ name, needsApproval: true, private: false })
    .returning({ id: timeOffTypes.id });
  return type!;
}

/** Puts one person on a policy from 1 January 2025, open-ended. */
export async function seedTimeOffAssignment(
  orm: Orm,
  input: { employeeId: string; timeOffTypeId: string; timeOffPolicyId: string },
): Promise<void> {
  await orm
    .insert(timeOffPolicyAssignments)
    .values({ ...input, startDate: "2025-01-01" as CalendarDate });
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
