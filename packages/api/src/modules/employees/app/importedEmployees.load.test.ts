import { employeeServices, employeeSetup, expect, OWNER, test } from "#test/support";

const ONE_MINUTE_MS = 60_000;

test(
  "imports 33,000 employees with their manager within a minute",
  { timeout: ONE_MINUTE_MS },
  async ({ orm, transact }) => {
    const inputs = Array.from({ length: 33_000 }, (_, index) => ({
      firstName: "Person",
      lastName: String(index),
      email: `person${index}@example.com`,
      managerEmail: index === 0 ? null : "person0@example.com",
    }));

    await transact((tx) =>
      employeeSetup.createImportedEmployees(OWNER, tx, inputs, { kind: "ADDED_FROM_IMPORT" }),
    );

    const people = employeeServices(orm);
    const id = (await people.listEmployees(OWNER, { filter: { search: "32999" } })).edges[0]!.node
      .id;
    expect((await people.readManagers(OWNER, [id])).get(id)?.email).toBe("person0@example.com");
  },
);
