import { expect, OWNER, seedPagingBoundary, test, workingPatternService } from "#test/support";
import { ApplicationError } from "../../../core/applicationError";

test.for(["readEmploymentTerms", "readSources", "countEmployees"] as const)(
  "%s handles 65536 keys without a raw database error",
  async (operation, { orm, seed, transact }) => {
    // Arrange: distinct keys match DataLoader's deduplication; absent keys must also be safe.
    const place = await seedPagingBoundary({ orm, seed, transact });
    const ids = Array.from(
      { length: 65_536 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );
    const calls = {
      readEmploymentTerms: () =>
        workingPatternService(orm).readEmploymentTerms(OWNER, { employeeIds: ids }),
      readSources: () => place.imports.reads.readSources(OWNER, ids),
      countEmployees: () => place.imports.reads.countEmployees(OWNER, ids),
    };

    // Act
    const [result] = await Promise.allSettled([Promise.resolve().then<unknown>(calls[operation])]);

    // Assert
    if (result.status === "fulfilled") return;
    expect(result.reason).toBeInstanceOf(ApplicationError);
    expect(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "FORBIDDEN"]).toContain(
      (result.reason as ApplicationError).code,
    );
  },
);
