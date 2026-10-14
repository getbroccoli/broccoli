import { expect, NON_OWNER, OWNER, PNG, storedFileIds, test } from "#test/support";

import { employeeRepository } from "../db";
import { parseNewEmployee } from "../domain";
import {
  clearDemoEmployees,
  createDemoEmployees,
  createEmployeeUseCases,
  hasDemoEmployees,
  hasEmployees,
} from ".";

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

test("refuses a non-owner clearing demo employees and keeps their avatars", async ({
  orm,
  seed,
  transact,
}) => {
  const avatarFileId = await seed.file({ content: PNG, mimeType: "image/png" });
  const employee = await employeeRepository(orm).insert({
    ...parseNewEmployee({ firstName: "Demo", lastName: "Employee", email: "demo@example.com" }),
    avatarFileId,
    isDemo: true,
  });
  const { listEmployees } = createEmployeeUseCases({ orm });

  await expect(transact((tx) => clearDemoEmployees(NON_OWNER, tx))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect((await listEmployees(OWNER, { first: 100 })).edges.map(({ node }) => node)).toEqual([
    employee,
  ]);
  expect(await storedFileIds(orm)).toEqual([avatarFileId]);
});

test("refuses a non-owner checking whether employees exist", async ({ transact }) => {
  await expect(transact((tx) => hasEmployees(NON_OWNER, tx))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses a non-owner checking whether demo employees exist", async ({ orm }) => {
  await expect(async () => hasDemoEmployees(NON_OWNER, orm)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
