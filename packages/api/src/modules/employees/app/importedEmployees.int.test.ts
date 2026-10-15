import { expect, NON_OWNER, OWNER, test } from "#test/support";

import { createEmployeeUseCases, createImportedEmployees } from ".";

test("creates complete employees and counts incomplete inputs", async ({ orm, transact }) => {
  const avery = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };
  const robin = { firstName: "Robin", lastName: "Reed", email: "robin@example.com" };

  const result = await transact((tx) =>
    createImportedEmployees(OWNER, tx, [
      avery,
      { firstName: "Sam", lastName: "", email: "sam@example.com" },
      robin,
    ]),
  );

  expect(result).toEqual({ created: 2, incomplete: 1, emailTaken: 0 });
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual(
    expect.arrayContaining([expect.objectContaining(avery), expect.objectContaining(robin)]),
  );
  expect(employees.edges).toHaveLength(2);
});

test("skips a taken email and leaves the existing employee unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const existing = await seed.employee({ email: "avery@example.com" });

  const result = await transact((tx) =>
    createImportedEmployees(OWNER, tx, [
      { firstName: "Avery", lastName: "Stone", email: existing.email },
    ]),
  );

  expect(result).toEqual({ created: 0, incomplete: 0, emailTaken: 1 });
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([existing]);
});

test("creates the first input when two inputs have the same email", async ({ orm, transact }) => {
  const first = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };

  const result = await transact((tx) =>
    createImportedEmployees(OWNER, tx, [first, { ...first, lastName: "Reed" }]),
  );

  expect(result).toEqual({ created: 1, incomplete: 0, emailTaken: 1 });
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([expect.objectContaining(first)]);
});

test("creates 1,001 employees across insert batches", async ({ orm, transact }) => {
  const inputs = Array.from({ length: 1_001 }, (_, index) => ({
    firstName: "Employee",
    lastName: String(index),
    email: `employee${index}@example.com`,
  }));

  const result = await transact((tx) => createImportedEmployees(OWNER, tx, inputs));

  expect(result).toEqual({ created: 1_001, incomplete: 0, emailTaken: 0 });
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 1_001 });
  expect(employees.edges.map(({ node }) => node.email).sort()).toEqual(
    inputs.map(({ email }) => email).sort(),
  );
  expect(employees.pageInfo.hasNextPage).toBe(false);
});

test("refuses a non-owner and creates no employees", async ({ orm, transact }) => {
  await expect(
    transact((tx) =>
      createImportedEmployees(NON_OWNER, tx, [
        { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
      ]),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(
    (await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 })).edges,
  ).toEqual([]);
});
