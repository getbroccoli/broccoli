import { sql } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  deleteAllEmployees,
  eventProcess,
  expect,
  expectBlockedBy,
  processService,
  signedIn,
  taskService,
  test,
  transactWithProcesses,
} from "#test/support";

import { ormOf } from "../../../core/db";
import { processRepository } from "../db";

test("one event for more people than one insert can hold starts a run for each", async ({
  orm,
  seed,
}) => {
  const people = await seed.employees(5_000);
  const definition = eventProcess("employees.added");
  definition.steps.push({ ...definition.steps[0]!, key: "second_follow_up" });
  const { key } = await seed.process({ key: "welcome", definition });
  const transact = transactWithProcesses(orm, { today });

  await transact((tx) => {
    tx.publish("employees.added", { employeeIds: people.map(({ id }) => id) });
    return Promise.resolve();
  });

  expect(await processService(orm).listRuns(ADMIN, key)).toHaveLength(5_000);
});

test(
  "an event starts its run while another transaction holds the process lock",
  { timeout: 5_000 },
  async ({ orm, seed, transact }) => {
    const employee = await seed.employee();
    const process = await seed.process({
      key: "welcome",
      definition: eventProcess("employees.added"),
    });
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holding = transact(async (tx) => {
      await processRepository(tx).lockProcess(process.id);
      locked.resolve();
      await release.promise;
    });

    try {
      await Promise.race([locked.promise, holding]);
      await transactWithProcesses(orm, { today })(async (tx) => {
        await ormOf(tx).execute(sql`set local lock_timeout = '2s'`);
        tx.publish("employees.added", { employeeIds: [employee.id] });
      });
    } finally {
      release.resolve();
      await holding;
    }

    expect(await processService(orm).listRuns(ADMIN, process.key)).toMatchObject([
      { record: { recordType: "employee", recordId: employee.id } },
    ]);
  },
);

test(
  "a reset waits for a task change whose event starts a run, and removes that run",
  { timeout: 5_000 },
  async ({ orm, seed, transact }) => {
    const employee = await seed.employee();
    const task = await seed.task({
      assigneeEmployeeId: employee.id,
      askedByEmployeeId: employee.id,
      subjectEmployeeId: employee.id,
    });
    const { key } = await seed.process({
      key: "follow_up",
      definition: eventProcess("tasks.task_status_changed", { field: "to", in: ["cancelled"] }),
    });
    const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });
    const locked = Promise.withResolvers<number>();
    const release = Promise.withResolvers<void>();
    const changing = transactWithProcesses(orm, { today })(async (tx) => {
      await taskService(orm, { transact: (work) => work(tx) }).cancel(
        ctx,
        task.id,
        "No longer needed",
      );
      const { rows } = await ormOf(tx).execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`,
      );
      locked.resolve(rows[0]!.pid);
      await release.promise;
    });
    await Promise.race([locked.promise, changing]);
    const resetting = transact((tx) => deleteAllEmployees(orm)(ADMIN, tx));
    const results = Promise.allSettled([changing, resetting]);

    try {
      await expectBlockedBy(orm, await locked.promise);
    } finally {
      release.resolve();
      await results;
    }

    expect(await results).toMatchObject([{ status: "fulfilled" }, { status: "fulfilled" }]);
    expect(await processService(orm).listRuns(ADMIN, key)).toEqual([]);
    expect(await taskService(orm).listMyTasks(ctx)).toEqual({
      needsYou: [],
      waitingOnOthers: [],
      resolvedRecently: [],
    });
  },
);

const today = () => calendarDate("2026-12-03");
