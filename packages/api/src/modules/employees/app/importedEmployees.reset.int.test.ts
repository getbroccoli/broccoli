import { sql } from "drizzle-orm";

import {
  employeeServices,
  expect,
  expectBlockedBy,
  expectHistoryReplaysTo,
  OWNER,
  test,
  employeeSetup,
} from "#test/support";

import { ormOf } from "../../../core/db";
import { employeeRepository, employmentRepository } from "../db";

test("an employee created during a reset keeps its creation history", async ({ orm, transact }) => {
  const employees = employeeServices(orm);
  const resetReady = Promise.withResolvers<number>();
  const releaseReset = Promise.withResolvers<void>();
  const resetting = transact(async (tx) => {
    await employeeSetup.deleteAllEmployees(OWNER, tx);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    resetReady.resolve(rows[0]!.pid);
    await releaseReset.promise;
  });
  const blockingPid = await resetReady.promise;

  const creation = Promise.allSettled([
    employees.createEmployee(OWNER, {
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
    }),
  ]);
  try {
    await expectBlockedBy(orm, blockingPid);
  } finally {
    releaseReset.resolve();
    await resetting;
    await creation;
  }

  expect(await creation).toMatchObject([{ status: "fulfilled" }]);
  const { edges } = await employees.listEmployees(OWNER, {});
  expect(edges).toHaveLength(1);
  const employee = edges[0]!.node;
  const history = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(
    history.edges.map(({ node }) => ({ recordId: node.recordId, operation: node.operation })),
  ).toEqual([{ recordId: employee.id, operation: "CREATED" }]);
  await expectHistoryReplaysTo(orm, employee.id);
});

test("a job title edit waiting for a reset lets it lock the employee", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ jobTitle: "Engineer" });
  const employees = employeeServices(orm);
  const resetReady = Promise.withResolvers<number>();
  const releaseReset = Promise.withResolvers<void>();
  const resetting = transact(async (tx) => {
    await employmentRepository(tx).lockForWrites();
    await ormOf(tx).execute(sql`lock table employees in share row exclusive mode`);
    const { rows } = await ormOf(tx).execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    resetReady.resolve(rows[0]!.pid);
    await releaseReset.promise;
    // Take the row lock reset's DELETE needs, keeping the employee for the waiting edit.
    await employeeRepository(tx).lockByIds([employee.id]);
  });
  const blockingPid = await resetReady.promise;

  const results = Promise.allSettled([
    resetting,
    employees.updateEmployee(OWNER, { id: employee.id, jobTitle: "Lead" }),
  ]);
  try {
    await expectBlockedBy(orm, blockingPid);
  } finally {
    releaseReset.resolve();
    await results;
  }

  expect(await results).toMatchObject([{ status: "fulfilled" }, { status: "fulfilled" }]);
  expect(await employees.readEmployee(OWNER, employee.id)).toMatchObject({ jobTitle: "Lead" });
});

test("deleting all employees also deletes occupied and empty locations", async ({
  orm,
  seed,
  transact,
}) => {
  const leeds = await seed.location("Leeds");
  await seed.location("York");
  await seed.employee({ locationId: leeds.id });

  await transact((tx) => employeeSetup.deleteAllEmployees(OWNER, tx));

  expect(await employeeServices(orm).listLocations(OWNER)).toEqual([]);
});
