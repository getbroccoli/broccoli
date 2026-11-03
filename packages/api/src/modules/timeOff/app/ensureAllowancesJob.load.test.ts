import { sql } from "drizzle-orm";

import { expect, OWNER, test, timeOffService } from "#test/support";

import type { Orm, Transact } from "../../../core/db";
import { createLogger } from "../../../core/logger";
import type { CalendarDate } from "../../../utils";
import { ensureAllowancesJob } from "./ensureAllowancesJob";

const EMPLOYEES = 10_000;
const BOOKED_LINES_PER_ALLOWANCE = 15;
const ONE_MINUTE_MS = 60_000;

test("the daily job runs within a minute for 10,000 people with five years of leave history", async ({
  orm,
  seed,
  transact,
}) => {
  for (let added = 0; added < EMPLOYEES; added += 1_000) {
    await seed.employees(1_000);
  }
  const service = timeOffService(orm, { today: "2022-06-01" });
  const policy = (await service.listPolicies(OWNER, orm)).find(
    ({ key }) => key === "uk_statutory_minimum",
  )!;
  const policyGroupId = await seed.everyoneGroupId();
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  for (const year of [2023, 2024, 2025, 2026]) {
    await runJobOn(orm, transact, `${year}-01-01`);
  }
  // Booking writes these lines once it exists; the engine must skip them.
  await orm.execute(sql`
    insert into allowance_ledger_lines
      (allowance_id, effective_date, unit, amount, kind, cause_kind, author_kind, idempotency_key)
    select id, leave_year_start + n, 'days', -1, 'time_off_booked', 'time_off_booked', 'user',
           id || ':booked:' || n
      from allowances, generate_series(1, ${BOOKED_LINES_PER_ALLOWANCE}) n`);

  const dailyCheckMs = await runJobOn(orm, transact, "2026-06-01");
  const newLeaveYearMs = await runJobOn(orm, transact, "2027-01-01");

  console.log({ dailyCheckMs, newLeaveYearMs });
  expect(dailyCheckMs).toBeLessThan(ONE_MINUTE_MS);
  expect(newLeaveYearMs).toBeLessThan(ONE_MINUTE_MS);
  const [{ allowanceCount }] = (
    await orm.execute<{ allowanceCount: number }>(
      sql`select count(*)::int as "allowanceCount" from allowances`,
    )
  ).rows as [{ allowanceCount: number }];
  expect(allowanceCount).toBe(EMPLOYEES * 6);
});

/** Runs the daily job as it would run on `today`, and returns how long it took. */
async function runJobOn(orm: Orm, transact: Transact, today: string): Promise<number> {
  const job = ensureAllowancesJob({
    orm,
    transact,
    logger: createLogger("warn"),
    timeOff: timeOffService(orm, { today }),
    today: () => today as CalendarDate,
  });
  const started = performance.now();
  await job["timeOff.ensureAllowances"]!.run({});
  return performance.now() - started;
}
