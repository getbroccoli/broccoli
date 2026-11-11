import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { employments } from "../../src/modules/employees/db";
import {
  timeOff,
  timeOffDays,
  timeOffPolicyRepository,
  timeOffTypes,
} from "../../src/modules/timeOff/db";
import type { NewPolicyVersion } from "../../src/modules/timeOff/domain";
import type { CalendarDate } from "../../src/utils";
import { calendarDate } from "./calendarDate";

/** A published policy without an assignment, its leave year from 1 January. */
export async function seedTimeOffPolicy(
  orm: Orm,
  input: {
    name: string;
    timeOffTypeId?: string;
    balance: "balance_from_allowance" | "unlimited_balance";
    entitlementDays?: number;
  },
): Promise<{ id: string; timeOffTypeId: string; versionId: string }> {
  const timeOffTypeId = input.timeOffTypeId ?? (await seedTimeOffType(orm, input.name)).id;
  const repository = timeOffPolicyRepository(orm);
  const id = await repository.insertPolicy({ timeOffTypeId, name: input.name });
  const versionId = await repository.insertVersion(id, {
    status: "published",
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
  });
  return { id, timeOffTypeId, versionId };
}

/** A company's own time off type without a policy. */
export async function seedTimeOffType(orm: Orm, name: string): Promise<{ id: string }> {
  const [type] = await orm
    .insert(timeOffTypes)
    .values({ name, needsApproval: true, private: false })
    .returning({ id: timeOffTypes.id });
  return type!;
}

/** A person's own assignment of a published policy. */
export function seedTimeOffAssignment(
  orm: Orm,
  input: {
    employeeId: string;
    timeOffTypeId: string;
    timeOffPolicyId: string;
    versionId: string;
    startDate?: string;
    endDate?: string | null;
  },
): Promise<string> {
  return timeOffPolicyRepository(orm).insertAssignment({
    owner: { employeeId: input.employeeId },
    timeOffTypeId: input.timeOffTypeId,
    timeOffPolicyId: input.timeOffPolicyId,
    versionId: input.versionId,
    startDate: calendarDate(input.startDate ?? "2025-01-01"),
    endDate: input.endDate ? calendarDate(input.endDate) : null,
  });
}

/** A new published policy assigned to these terms for the given dates. */
export async function seedTermsPolicy(
  orm: Orm,
  input: {
    termsId: string;
    timeOffTypeId: string;
    version: NewPolicyVersion;
    startDate: string;
    endDate?: string | null;
  },
) {
  const repository = timeOffPolicyRepository(orm);
  const id = await repository.insertPolicy({ timeOffTypeId: input.timeOffTypeId });
  const versionId = await repository.insertVersion(id, { ...input.version, status: "published" });
  const assignmentId = await repository.insertAssignment({
    owner: { termsId: input.termsId },
    timeOffTypeId: input.timeOffTypeId,
    timeOffPolicyId: id,
    versionId,
    startDate: calendarDate(input.startDate),
    endDate: input.endDate ? calendarDate(input.endDate) : null,
  });
  return { id, timeOffTypeId: input.timeOffTypeId, versionId, assignmentId };
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
