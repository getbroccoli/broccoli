import { expect, NON_OWNER, OWNER, PNG, storedFileIds, test } from "#test/support";

import { createDemoEmployees, createEmployeeUseCases, hasDemoEmployees } from ".";

test("refuses a non-owner creating demo employees without storing employees or avatars", async ({
  orm,
  transact,
}) => {
  const { listEmployees } = createEmployeeUseCases({ orm });

  await expect(
    transact((tx) =>
      createDemoEmployees(NON_OWNER, tx, [
        {
          employee: { firstName: "Demo", lastName: "Employee", email: "demo@example.com" },
          avatar: { bytes: PNG, mimeType: "image/png" },
        },
      ]),
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
    createDemoEmployees(OWNER, tx, [
      {
        employee: { firstName: "Demo", lastName: "Employee", email: "demo@example.com" },
        avatar: { bytes: PNG, mimeType: "image/png" },
      },
    ]),
  );

  const { edges } = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
});
