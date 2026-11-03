import { sql } from "drizzle-orm";
import { assert } from "vitest";

import {
  employeeServices,
  employeeSetup,
  expect,
  linkStatutoryMinimumToEveryone,
  OWNER,
  readAllowances,
  test,
  timeOffService,
  transactWithTimeOffEvents,
  workingPatternService,
} from "#test/support";
import { ormOf } from "../../../core/db";
import { parseCalendarDate } from "../../../utils";
// eslint-disable-next-line boundaries/dependencies -- Coordinates the employee writes with a concurrent policy link for this regression.
import { employeeRepository, employmentRepository } from "../../employees/db";

test("an imported batch gets allowances and replaying its event appends no duplicate lines", async ({
  orm,
  seed,
  transact,
}) => {
  await linkStatutoryMinimumToEveryone(orm, seed, transact);
  const dispatching = transactWithTimeOffEvents(orm);

  const { idsByEmail } = await dispatching((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [
        { firstName: "Sam", lastName: "Stone", email: "sam@example.com", startDate: "2025-01-01" },
        {
          firstName: "Robin",
          lastName: "Reed",
          email: "robin@example.com",
          startDate: "2026-10-12",
        },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );
  const ids = [...idsByEmail.values()];
  const before = await Promise.all(ids.map((id) => readAllowances(orm, id)));
  expect(before).toMatchObject([
    [{ typeKey: "annual_leave", total: 20 }],
    [{ typeKey: "annual_leave", total: 4.5 }],
  ]);

  await dispatching((tx) => {
    tx.publish("employees.added", { employeeIds: ids });
    return Promise.resolve();
  });

  expect(await Promise.all(ids.map((id) => readAllowances(orm, id)))).toEqual(before);
});

test("adding a person writes no allowance when no policy is linked", async ({ orm }) => {
  const employees = employeeServices(orm);

  const employee = await employees.createEmployee(OWNER, {
    firstName: "Sam",
    lastName: "Stone",
    email: "sam.stone@example.com",
    startDate: "2025-01-01",
  });

  assert(employee);
  expect(await readAllowances(orm, employee.id)).toEqual([]);
});

test("adding a person grants Annual leave before returning when Everyone has a policy", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );

  const employee = await employeeServices(orm).createEmployee(OWNER, {
    firstName: "Sam",
    lastName: "Stone",
    email: "sam.stone@example.com",
    startDate: "2025-01-01",
  });

  assert(employee);
  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 20,
    },
  ]);
  expect(allowances[0]!.lines.map(({ causeKind, causeRef }) => ({ causeKind, causeRef }))).toEqual(
    Array.from({ length: 9 }, () => ({ causeKind: "employee_added", causeRef: null })),
  );
});

test(
  "a change to a person's email and start date and a policy link that overlap both complete",
  { timeout: 10_000 },
  async ({ orm, seed, transact, signal }) => {
    const employee = await seed.employee({ startDate: "2025-01-01" });
    const startDate = parseCalendarDate("2026-10-12")!;
    const service = timeOffService(orm);
    const policyGroupId = await seed.everyoneGroupId();
    const policy = (await service.listPolicies(OWNER, orm)).find(
      (p) => p.key === "uk_statutory_minimum",
    )!;
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const releaseLock = () => release.resolve();
    // Release on timeout too, so a blocked grant cannot strand database cleanup.
    signal.addEventListener("abort", releaseLock, { once: true });
    const changing = transactWithTimeOffEvents(orm)(async (tx) => {
      await employeeRepository(tx).update(employee.id, { email: "new.address@example.com" });
      locked.resolve();
      await release.promise;
      await employmentRepository(tx).setStartDate(employee.id, startDate);
      tx.publish("employees.start_date_changed", {
        employeeId: employee.id,
        startDate,
        previousStartDate: parseCalendarDate("2025-01-01")!,
      });
    });
    await Promise.race([locked.promise, changing]);
    const linkPid = Promise.withResolvers<number>();
    const linking = transact(async (tx) => {
      const { rows } = await ormOf(tx).execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`,
      );
      linkPid.resolve(rows[0]!.pid);
      return service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] });
    });
    const results = Promise.allSettled([changing, linking]);

    try {
      const pid = await linkPid.promise;
      while (true) {
        signal.throwIfAborted();
        const { rows } = await orm.execute<{ waiting: boolean }>(sql`
          select exists (select from pg_locks where pid = ${pid} and not granted) as waiting
        `);
        if (rows[0]!.waiting) {
          break;
        }
      }
      release.resolve();

      expect(await results).toMatchObject([{ status: "fulfilled" }, { status: "fulfilled" }]);
      expect(await readAllowances(orm, employee.id)).toMatchObject([
        { typeKey: "annual_leave", total: 4.5 },
      ]);
    } finally {
      release.resolve();
      signal.removeEventListener("abort", releaseLock);
      await results;
    }
  },
);

test("moving a start date to October appends corrections and keeps the earlier allowance lines", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const [before] = await readAllowances(orm, employee.id);
  expect(before!.total).toBe(20);

  await employeeServices(orm).updateEmployee(OWNER, { id: employee.id, startDate: "2026-10-12" });

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ typeKey: "annual_leave", total: 4.5 }]);
  const lines = allowances[0]!.lines;
  expect(lines.slice(0, before!.lines.length)).toEqual(before!.lines);
  const appended = lines.slice(before!.lines.length);
  expect(appended.length).toBeGreaterThan(0);
  expect(
    appended.every(
      (line) => line.causeKind === "start_date_changed" && line.causeRef === "2026-10-12",
    ),
  ).toBe(true);
});

test("a September working pattern change reduces the grant and restores December bank holidays", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const policyGroupId = await seed.everyoneGroupId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    (p) => p.key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkGroupPolicies(OWNER, tx, { policyGroupId, timeOffPolicyIds: [policy.id] }),
  );
  const [before] = await readAllowances(orm, employee.id);
  expect(before!.total).toBe(20);
  const patterns = workingPatternService(orm, { transact: transactWithTimeOffEvents(orm) });
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;

  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [0, 450, 450, 450, 0, 0, 0],
    fullDayMinutes: 450,
  });

  const allowances = await readAllowances(orm, employee.id);
  expect(allowances).toMatchObject([{ typeKey: "annual_leave", total: 18.5 }]);
  const lines = allowances[0]!.lines;
  expect(lines.slice(0, before!.lines.length)).toEqual(before!.lines);
  const appended = lines.slice(before!.lines.length);
  expect(appended).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "entitlement_grant", amount: -3.743562 }),
    ]),
  );
  expect(
    appended.every(
      (line) => line.causeKind === "working_pattern_changed" && line.causeRef === "2026-09-01",
    ),
  ).toBe(true);
  for (const [date, amount] of [
    ["2026-08-31", -1],
    ["2026-12-25", 0],
    ["2026-12-28", 0],
  ] as const) {
    expect(
      lines
        .filter((line) => line.kind === "bank_holiday_taken" && line.effectiveDate === date)
        .reduce((sum, line) => sum + line.amount, 0),
    ).toBe(amount);
  }
});
