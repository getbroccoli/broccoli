import { assert } from "vitest";

import { employeeServices, employeeSetup, expect, OWNER, PNG, test } from "#test/support";
import { type Orm, transactor } from "../../../core/db";
import { createEventBus, type DomainEvents } from "../../../core/events";
import { createLogger } from "../../../core/logger";

test("adding a person publishes their id after commit", async ({ orm }) => {
  const { transact, added } = employmentEvents(orm);

  const employee = await employeeServices(orm, { transact }).createEmployee(OWNER, PERSON);

  assert(employee);
  expect(added).toEqual([{ employeeIds: [employee.id] }]);
});

test("an import publishes one batch containing only the people it added", async ({ orm, seed }) => {
  const taken = await seed.employee();
  const { transact, added } = employmentEvents(orm);

  const result = await transact((tx) =>
    employeeSetup.createImportedEmployees(
      OWNER,
      tx,
      [
        PERSON,
        { ...PERSON, email: "second@example.com" },
        { ...PERSON, email: taken.email },
        { ...PERSON, lastName: "" },
      ],
      { kind: "ADDED_FROM_IMPORT" },
    ),
  );

  expect(result.created).toBe(2);
  expect(added).toEqual([{ employeeIds: [...result.idsByEmail.values()] }]);
});

test("adding nobody publishes no employee event", async ({ orm, seed }) => {
  await seed.employee(PERSON);
  const { transact, added } = employmentEvents(orm);

  await transact((tx) =>
    employeeSetup.createImportedEmployees(OWNER, tx, [PERSON], { kind: "ADDED_FROM_IMPORT" }),
  );

  expect(added).toEqual([]);
});

test("adding the demo publishes its people once", async ({ orm }) => {
  const { transact, added } = employmentEvents(orm);
  const people = [{ employee: PERSON, avatar: { bytes: PNG, mimeType: "image/png" as const } }];

  await transact((tx) =>
    employeeSetup.createDemoEmployees(OWNER, tx, people, { kind: "ADDED_WITH_DEMO" }),
  );
  await transact((tx) =>
    employeeSetup.createDemoEmployees(OWNER, tx, people, { kind: "ADDED_WITH_DEMO" }),
  );

  const employees = await employeeServices(orm).listEmployees(OWNER, {});
  expect(added).toEqual([{ employeeIds: employees.edges.map(({ node }) => node.id) }]);
});

test("rolling back an import publishes no added employees", async ({ orm }) => {
  const { transact, added } = employmentEvents(orm);

  await expect(
    transact(async (tx) => {
      await employeeSetup.createImportedEmployees(OWNER, tx, [PERSON], {
        kind: "ADDED_FROM_IMPORT",
      });
      throw new Error("Cancel import");
    }),
  ).rejects.toThrow("Cancel import");

  expect(added).toEqual([]);
  expect((await employeeServices(orm).listEmployees(OWNER, {})).edges).toEqual([]);
});

test("changing or clearing a start date publishes the previous and new dates", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const { transact, changed } = employmentEvents(orm);
  const employees = employeeServices(orm, { transact });

  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2026-10-12" });
  await employees.updateEmployee(OWNER, { id: employee.id, startDate: null });
  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2026-07-01" });

  expect(changed).toEqual([
    { employeeId: employee.id, previousStartDate: "2025-01-01", startDate: "2026-10-12" },
    { employeeId: employee.id, previousStartDate: "2026-10-12", startDate: null },
    { employeeId: employee.id, previousStartDate: null, startDate: "2026-07-01" },
  ]);
});

test("an unchanged start date or an unrelated edit publishes no start date event", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const { transact, changed } = employmentEvents(orm);
  const employees = employeeServices(orm, { transact });

  await employees.updateEmployee(OWNER, { id: employee.id, startDate: "2025-01-01" });
  await employees.updateEmployee(OWNER, { id: employee.id, firstName: "Robin" });

  expect(changed).toEqual([]);
});

const PERSON = { firstName: "Sam", lastName: "Stone", email: "sam@example.com" };

function employmentEvents(orm: Orm) {
  const added: DomainEvents["employees.added"][] = [];
  const changed: DomainEvents["employees.start_date_changed"][] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "employees.added": (event) => {
      added.push(event);
      return Promise.resolve();
    },
    "employees.start_date_changed": (event) => {
      changed.push(event);
      return Promise.resolve();
    },
  });
  return { transact: transactor(orm, eventBus), added, changed };
}
