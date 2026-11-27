import { sql } from "drizzle-orm";

import {
  calendarDate,
  expect,
  expectBlockedBy,
  OWNER,
  ownTimeOffRulesService,
  seedAnnualLeaveEmployee,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";
import { ormOf } from "../../../core/db";
import { createLogger } from "../../../core/logger";
import { createOwnTimeOffRulesService } from "./ownTimeOffRulesService";

test("returning to inherited rules and saving an own working week both finish without a deadlock", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const today = "2026-11-09";
  const startDate = "2027-01-01";
  const timeOff = timeOffService(orm, { today });
  await ownTimeOffRulesService(orm, { today }).setOwnRules(OWNER, {
    ...person,
    startDate,
    rules: { balance: "unlimited_balance" },
  });
  const beforeAllowances = Promise.withResolvers<number>();
  const resume = Promise.withResolvers<void>();
  const own = createOwnTimeOffRulesService({
    orm,
    transact,
    today: () => calendarDate(today),
    logger: createLogger("silent"),
    timeOff: {
      async ensureAllowances(ctx, tx, change) {
        const { rows } = await ormOf(tx).execute<{ pid: number }>(
          sql`select pg_backend_pid() as pid`,
        );
        beforeAllowances.resolve(rows[0]!.pid);
        await resume.promise;
        return timeOff.ensureAllowances(ctx, tx, change);
      },
    },
  });

  const returning = own.useTermsRules(OWNER, { ...person, startDate });
  void returning.catch(beforeAllowances.reject);
  const blockingPid = await beforeAllowances.promise;
  const saving = workingPatternService(orm, { today }).setOwnWorkingWeek(OWNER, {
    employeeId: person.employeeId,
    startDate,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  const blocked = expectBlockedBy(orm, blockingPid).finally(resume.resolve);
  await Promise.allSettled([returning, saving, blocked]);

  await expect(returning).resolves.toBeUndefined();
  await expect(saving).resolves.toBeUndefined();
  await blocked;
});
