import { sql } from "drizzle-orm";

import {
  employeeUseCases,
  expect,
  expectBlockedBy,
  expectHistoryReplaysTo,
  OWNER,
  test,
} from "#test/support";

import { ormOf } from "../../../core/db";
import { deleteAllEmployees } from ".";

test("an employee created during a reset keeps its creation history", async ({ orm, transact }) => {
  const employees = employeeUseCases(orm);
  const resetReady = Promise.withResolvers<number>();
  const releaseReset = Promise.withResolvers<void>();
  const resetting = transact(async (tx) => {
    await deleteAllEmployees(OWNER, tx);
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
