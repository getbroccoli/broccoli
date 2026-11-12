import { expect, seedPagingBoundary, test } from "#test/support";
import { ApplicationError } from "../applicationError";

// Each family uses its own valid envelope, so an unrelated order cannot mask value validation.
test.for([
  {
    field: "Query.employees",
    values: ["NAME", "ASC", "\0", "", "00000000-0000-4000-8000-000000000001"],
  },
  { field: "Employee.history", values: ["NEWEST", "DESC", "\0"] },
  { field: "Terms.history", values: ["NEWEST", "DESC", "\0"] },
  { field: "Task.history", values: ["NEWEST", "DESC", "\0"] },
  { field: "Query.recordHistory(terms)", values: ["NEWEST", "DESC", "\0"] },
  { field: "Import.employees", values: ["NAME", "ASC", "\0", "", "avery@example.com"] },
  { field: "ImportSource.records", values: ["ADDED", "ASC", "\0"] },
] as const)(
  "%j accepts or refuses decoded cursor values without a raw error",
  async ({ field, values }, { orm, seed, transact }) => {
    // Arrange
    const { connections } = await seedPagingBoundary({ orm, seed, transact });
    const after = Buffer.from(JSON.stringify(values)).toString("base64url");

    // Act
    const [result] = await Promise.allSettled([
      Promise.resolve().then<unknown>(() => connections[field]({ first: 1, after })),
    ]);

    // Assert: in-memory import names can safely compare NUL; database-bound keys must refuse it.
    if (field === "Import.employees") {
      expect(result.status).toBe("fulfilled");
    } else {
      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") return;
      expect(result.reason).toBeInstanceOf(ApplicationError);
      expect(result.reason).toMatchObject({ code: "INVALID_INPUT" });
    }
  },
);
