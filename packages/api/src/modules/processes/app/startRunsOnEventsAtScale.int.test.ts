import { sql } from "drizzle-orm";

import {
  ADMIN,
  calendarDate,
  eventProcess,
  expect,
  processService,
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

const today = () => calendarDate("2026-12-03");
