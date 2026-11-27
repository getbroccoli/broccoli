import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { addDays, todayInLondon, weekdayOf } from "../../src/utils";
import { calendarDate } from "./calendarDate";
import { seedTermsPeriods } from "./seedTerms";
import { seedTimeOff } from "./seedTimeOff";
import { seedWorkingPattern, seedOwnWeek } from "./seedWorkingPattern";
import type { TestEnv } from "./testEnv";
import { OWNER } from "./testSecurityContext";
import { testTransactor } from "./testTransactor";
import { giveTermsPolicies, ownTimeOffRulesService, readTermsPolicies } from "./timeOffService";

/** An employee with their own week and Annual leave, inherited Sickness and a March move. */
export async function seedNoTermsMove(env: TestEnv) {
  const today = todayInLondon();
  const year = Number(today.slice(0, 4)) + 1;
  const from = `${year}-01-01`;
  const ownFrom = `${year - 1}-01-01`;
  const laterMove = calendarDate(`${year}-03-01`);
  const employee = await env.seed.employee({ startDate: "2024-03-01" });
  const england = await env.seed.defaultTermsId();
  const scotland = await env.seed.terms("Scotland");
  const db = connectDatabase(env.db.url, createLogger("silent"));
  try {
    const transact = testTransactor(db.orm);
    await giveTermsPolicies(db.orm, transact, {
      termsId: england,
      today,
      policies: [{ recordOnly: "sickness" }, { key: "uk_20_days_plus_bank_holidays" }],
    });
    await giveTermsPolicies(db.orm, transact, {
      termsId: scotland,
      today,
      policies: [{ recordOnly: "sickness" }],
    });
    const annual = (await readTermsPolicies(db.orm, england, today)).find(
      (policy) => policy.typeKey === "annual_leave",
    )!;
    const week = await seedWorkingPattern(db.orm, { minutes: [360, 360, 360, 360, 0, 0, 0] });
    await seedOwnWeek(db.orm, {
      employeeId: employee.id,
      versionId: week.versionId,
      startDate: ownFrom,
    });
    await ownTimeOffRulesService(db.orm, { today }).setOwnRules(OWNER, {
      employeeId: employee.id,
      timeOffTypeId: annual.timeOffTypeId,
      startDate: ownFrom,
      rules: { balance: "unlimited_balance" },
    });
    await seedTermsPeriods(db.orm, employee.id, [
      { termsId: england, startDate: null, endDate: addDays(laterMove, -1) },
      { termsId: scotland, startDate: laterMove, endDate: null },
    ]);
    return {
      employeeId: employee.id,
      england,
      scotland,
      from,
      laterMove,
      previousEnd: `${year - 1}-12-31`,
    };
  } finally {
    await db.close();
  }
}

/** An inherited Annual leave booking that a January move to No terms would leave without rules. */
export async function seedBookedTermsDay(env: TestEnv) {
  const today = todayInLondon();
  const year = Number(today.slice(0, 4)) + 1;
  const employee = await env.seed.employee({
    firstName: "Aisha",
    lastName: "Begum",
    startDate: "2024-03-01",
  });
  const termsId = await env.seed.defaultTermsId();
  const db = connectDatabase(env.db.url, createLogger("silent"));
  try {
    await giveTermsPolicies(db.orm, testTransactor(db.orm), {
      termsId,
      today,
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    });
    const [annual] = await readTermsPolicies(db.orm, termsId, today);
    const fourth = calendarDate(`${year}-01-04`);
    const weekday = weekdayOf(fourth);
    const bookedDay = weekday < 5 ? fourth : addDays(fourth, 7 - weekday);
    await seedTimeOff(db.orm, {
      employeeId: employee.id,
      timeOffTypeId: annual!.timeOffTypeId,
      status: "approved",
      days: [{ date: bookedDay, dayPart: "full_day" }],
    });
    return { employeeId: employee.id, startDate: `${year}-01-01`, bookedDay };
  } finally {
    await db.close();
  }
}
