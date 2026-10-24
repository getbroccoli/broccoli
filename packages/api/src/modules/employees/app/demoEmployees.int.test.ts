import {
  employeeUseCases,
  expectHistoryReplaysTo,
  expect,
  NON_OWNER,
  OWNER,
  PNG,
  storedFileIds,
  test,
} from "#test/support";

import { createDemoEmployees, hasDemoEmployees } from ".";

test("refuses a non-owner creating demo employees without storing employees or avatars", async ({
  orm,
  transact,
}) => {
  const { listEmployees } = employeeUseCases(orm);

  await expect(
    transact((tx) =>
      createDemoEmployees(
        NON_OWNER,
        tx,
        [
          {
            employee: { firstName: "Demo", lastName: "Employee", email: "demo@example.com" },
            avatar: { bytes: PNG, mimeType: "image/png" },
          },
        ],
        { kind: "ADDED_WITH_DEMO" },
      ),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect((await listEmployees(OWNER, { first: 100 })).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("refuses a non-owner checking whether demo employees exist", async ({ orm }) => {
  await expect(async () => hasDemoEmployees(NON_OWNER, orm)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("creates no demo employees when employees exist", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();

  await transact((tx) =>
    createDemoEmployees(
      OWNER,
      tx,
      [
        {
          employee: { firstName: "Demo", lastName: "Employee", email: "demo@example.com" },
          avatar: { bytes: PNG, mimeType: "image/png" },
        },
      ],
      { kind: "ADDED_WITH_DEMO" },
    ),
  );

  const { edges } = await employeeUseCases(orm).listEmployees(OWNER, {});
  expect(edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("records a creation line for each demo employee with the supplied cause", async ({
  orm,
  transact,
}) => {
  const demoEmployees = [
    {
      employee: {
        firstName: "Avery",
        lastName: "Stone",
        email: "avery@example.com",
        startDate: "2026-02-28",
      },
      avatar: { bytes: PNG, mimeType: "image/png" as const },
    },
    {
      employee: {
        firstName: "Robin",
        lastName: "Reed",
        email: "robin@example.com",
        jobTitle: "Engineer",
      },
      avatar: { bytes: PNG, mimeType: "image/png" as const },
    },
  ];

  await transact((tx) =>
    createDemoEmployees(OWNER, tx, demoEmployees, { kind: "ADDED_WITH_DEMO" }),
  );

  const employees = employeeUseCases(orm);
  const { edges } = await employees.listEmployees(OWNER, {});
  expect(edges).toHaveLength(2);
  for (const { node: employee } of edges) {
    const history = await employees.readEmployeeHistory(OWNER, employee.id, {});
    expect(history.edges).toHaveLength(1);
    expect(history.edges[0]!.node).toMatchObject({
      operation: "CREATED",
      cause: { kind: "ADDED_WITH_DEMO", ref: null },
      author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    });
    await expectHistoryReplaysTo(orm, employee.id);
  }
});
