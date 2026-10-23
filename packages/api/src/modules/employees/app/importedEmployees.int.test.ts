import {
  recordChangedEvents,
  employeeUseCases,
  expectHistoryReplaysTo,
  expect,
  NON_OWNER,
  OWNER,
  PNG,
  storedFileIds,
  test,
} from "#test/support";

import { employeeRepository } from "../db";
import { parseNewEmployee } from "../domain";
import { createImportedEmployees, deleteAllEmployees, findTakenEmails } from ".";

test("creates complete employees and counts incomplete inputs", async ({ orm, transact }) => {
  const avery = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };
  const robin = { firstName: "Robin", lastName: "Reed", email: "robin@example.com" };

  const result = await transact((tx) =>
    createImportedEmployees(
      OWNER,
      tx,
      [avery, { firstName: "Sam", lastName: "", email: "sam@example.com" }, robin],
      { kind: "IMPORTED_FROM_FILE" },
    ),
  );

  expect(result).toEqual({ created: 2, incomplete: 1, emailTaken: 0 });
  const employees = await employeeUseCases(orm).listEmployees(OWNER, { first: 100 });
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
    createImportedEmployees(
      OWNER,
      tx,
      [{ firstName: "Avery", lastName: "Stone", email: existing.email }],
      { kind: "IMPORTED_FROM_FILE" },
    ),
  );

  expect(result).toEqual({ created: 0, incomplete: 0, emailTaken: 1 });
  const employees = await employeeUseCases(orm).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([existing]);
});

test("finds only taken emails among 70,000 distinct emails", async ({ orm, seed }) => {
  const existing = await seed.employee({ email: "employee69999@example.com" });
  const emails = Array.from({ length: 70_000 }, (_, index) => `employee${index}@example.com`);

  const taken = await findTakenEmails(OWNER, orm, emails);

  expect(taken).toEqual(new Set([existing.email]));
});

test("creates the first input when two inputs have the same email", async ({ orm, transact }) => {
  const first = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };

  const result = await transact((tx) =>
    createImportedEmployees(OWNER, tx, [first, { ...first, lastName: "Reed" }], {
      kind: "IMPORTED_FROM_FILE",
    }),
  );

  expect(result).toEqual({ created: 1, incomplete: 0, emailTaken: 1 });
  const employees = await employeeUseCases(orm).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([expect.objectContaining(first)]);
});

test("creates 1,001 employees across insert batches", async ({ orm, transact }) => {
  const inputs = Array.from({ length: 1_001 }, (_, index) => ({
    firstName: "Employee",
    lastName: String(index),
    email: `employee${index}@example.com`,
  }));

  const result = await transact((tx) =>
    createImportedEmployees(OWNER, tx, inputs, { kind: "IMPORTED_FROM_FILE" }),
  );

  expect(result).toEqual({ created: 1_001, incomplete: 0, emailTaken: 0 });
  const employees = await employeeUseCases(orm).listEmployees(OWNER, { first: 1_001 });
  expect(employees.edges.map(({ node }) => node.email).sort()).toEqual(
    inputs.map(({ email }) => email).sort(),
  );
  expect(employees.pageInfo.hasNextPage).toBe(false);
});

test("refuses a non-owner and creates no employees", async ({ orm, transact }) => {
  await expect(
    transact((tx) =>
      createImportedEmployees(
        NON_OWNER,
        tx,
        [{ firstName: "Avery", lastName: "Stone", email: "avery@example.com" }],
        { kind: "IMPORTED_FROM_FILE" },
      ),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect((await employeeUseCases(orm).listEmployees(OWNER, { first: 100 })).edges).toEqual([]);
});

test("assigns avatars only to complete employees with untaken emails, keeping the first duplicate", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.employee({ email: "taken@example.com" });
  const keptPhoto = await seed.file({ content: PNG, mimeType: "image/png" });
  const takenPhoto = await seed.file({ content: PNG, mimeType: "image/png" });
  const incompletePhoto = await seed.file({ content: PNG, mimeType: "image/png" });
  const duplicatePhoto = await seed.file({ content: PNG, mimeType: "image/png" });
  const avery = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };

  const result = await transact((tx) =>
    createImportedEmployees(
      OWNER,
      tx,
      [
        { ...avery, avatarFileId: keptPhoto },
        { ...avery, avatarFileId: duplicatePhoto },
        { ...avery, email: "taken@example.com", avatarFileId: takenPhoto },
        { ...avery, email: "incomplete@example.com", lastName: "", avatarFileId: incompletePhoto },
        { ...avery, email: "initials@example.com" },
      ],
      { kind: "IMPORTED_FROM_FILE" },
    ),
  );

  expect(result).toEqual({ created: 2, incomplete: 1, emailTaken: 2 });
  const employees = await employeeUseCases(orm).listEmployees(OWNER, {});
  expect(
    employees.edges
      .filter(({ node }) => node.avatarFileId !== null)
      .map(({ node }) => ({
        email: node.email,
        avatarFileId: node.avatarFileId,
      })),
  ).toEqual([{ email: avery.email, avatarFileId: keptPhoto }]);
});

test("deleting all employees deletes their avatars", async ({ orm, seed, transact }) => {
  await employeeRepository(orm).insert({
    ...parseNewEmployee({ firstName: "Demo", lastName: "Employee", email: "demo@example.com" }),
    avatarFileId: await seed.file({ content: PNG, mimeType: "image/png" }),
    isDemo: true,
  });
  await seed.employee({ avatarFileId: await seed.file({ content: PNG, mimeType: "image/png" }) });

  await transact((tx) => deleteAllEmployees(OWNER, tx));

  expect((await employeeUseCases(orm).listEmployees(OWNER, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("records one creation per inserted employee with the supplied cause and none for skipped inputs", async ({
  orm,
  seed,
}) => {
  const taken = await seed.employee({ email: "taken@example.com" });
  const { transact, events } = recordChangedEvents(orm);

  const result = await transact((tx) =>
    createImportedEmployees(
      OWNER,
      tx,
      [
        {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          startDate: "2026-02-28",
        },
        { firstName: "Robin", lastName: "Reed", email: "robin@example.com", jobTitle: "Engineer" },
        { firstName: "Taken", lastName: "Employee", email: taken.email },
        { firstName: "Incomplete", lastName: "", email: "incomplete@example.com" },
      ],
      { kind: "IMPORTED_FROM_FILE", ref: "import-1" },
    ),
  );

  expect(result).toEqual({ created: 2, incomplete: 1, emailTaken: 1 });
  const employees = employeeUseCases(orm);
  const inserted = (await employees.listEmployees(OWNER, {})).edges
    .map(({ node }) => node)
    .filter((employee) => employee.id !== taken.id);
  expect(inserted).toHaveLength(2);
  expect(events).toHaveLength(2);
  for (const employee of inserted) {
    const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
    expect(edges).toHaveLength(1);
    const line = edges[0]!.node;
    expect(line).toMatchObject({
      operation: "CREATED",
      cause: { kind: "IMPORTED_FROM_FILE", ref: "import-1" },
      author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    });
    expect(events.find((event) => event.recordId === employee.id)).toEqual({
      historyId: line.id,
      recordType: "employee",
      recordId: employee.id,
      operation: "CREATED",
      fields: line.changes.map(({ field }) => field),
      causeKind: "IMPORTED_FROM_FILE",
      causeRef: "import-1",
    });
    await expectHistoryReplaysTo(orm, employee.id);
  }
  expect((await employees.readEmployeeHistory(OWNER, taken.id, {})).edges).toEqual([]);
});

test("deleting all employees purges history including already deleted employees without publishing", async ({
  orm,
}) => {
  const employees = employeeUseCases(orm);
  const kept = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  const deleted = await employees.createEmployee(OWNER, {
    firstName: "Robin",
    lastName: "Reed",
    email: "robin@example.com",
  });
  await employees.deleteEmployee(OWNER, { id: deleted.id });
  const { transact, events } = recordChangedEvents(orm);

  await transact((tx) => deleteAllEmployees(OWNER, tx));

  expect((await employees.listEmployees(OWNER, {})).edges).toEqual([]);
  expect((await employees.readEmployeeHistory(OWNER, kept.id, {})).edges).toEqual([]);
  expect((await employees.readEmployeeHistory(OWNER, deleted.id, {})).edges).toEqual([]);
  expect(events).toEqual([]);
});
