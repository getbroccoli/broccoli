import { expect, OWNER, readAllowances, test, timeOffService } from "#test/support";

import { createLogger } from "../../../core/logger";
import type { CalendarDate } from "../../../utils";
import { ensureAllowancesJob } from "./ensureAllowancesJob";

test("a run on 1 January creates the new year's allowances", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm, { today: "2026-06-01" });
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const [before] = await readAllowances(orm, employee.id);
  expect(before).toMatchObject({ leaveYearStart: "2026-01-01", total: 20 });
  const job = ensureAllowancesJob({
    orm,
    transact,
    logger: createLogger("silent"),
    timeOff: timeOffService(orm, { today: "2027-01-01" }),
    today: () => "2027-01-01" as CalendarDate,
  });

  await job["timeOff.ensureAllowances"]!.run({});

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([
    before,
    {
      typeKey: "annual_leave",
      leaveYearStart: "2027-01-01",
      leaveYearEnd: "2027-12-31",
      total: 20,
    },
  ]);
  expect(allowances[0]).toEqual(before);
  expect(
    allowances[1]!.lines.every(
      (line) => line.causeKind === "leave_year_started" && line.causeRef === "2027-01-01",
    ),
  ).toBe(true);
});

test("a run repairs a missing allowance", async ({ orm, seed, transact }) => {
  const service = timeOffService(orm, { today: "2026-06-01" });
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const employee = await seed.employee({ startDate: "2025-01-01" });
  expect(await readAllowances(orm, employee.id)).toEqual([]);
  const job = ensureAllowancesJob({
    orm,
    transact,
    logger: createLogger("silent"),
    timeOff: service,
    today: () => "2026-06-01" as CalendarDate,
  });

  await job["timeOff.ensureAllowances"]!.run({});

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 20,
    },
  ]);
  expect(
    allowances[0]!.lines.every(
      (line) => line.causeKind === "daily_check" && line.causeRef === "2026-06-01",
    ),
  ).toBe(true);
});
