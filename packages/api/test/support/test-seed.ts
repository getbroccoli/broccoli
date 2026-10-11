import type { Actor } from "../../src/core/actor";
import type { Orm } from "../../src/core/db";
import {
  createEmployeeUseCases,
  type Employee,
  type NewEmployeeInput,
} from "../../src/modules/employees";

/** The owner as use cases see them; seeding acts as the owner. */
export const OWNER: Actor = { userId: "test-owner", isOwner: true };

/**
 * Creates test data through the public use cases, never by raw inserts. Defaults are
 * unique demo values, so a test sets only the fields it is about.
 */
export class TestSeed {
  #count = 0;

  constructor(private readonly orm: Orm) {}

  employee(overrides: Partial<NewEmployeeInput> = {}): Promise<Employee> {
    const number = ++this.#count;
    return createEmployeeUseCases({ orm: this.orm }).createEmployee(OWNER, {
      firstName: "Employee",
      lastName: String(number),
      email: `employee${number}@example.com`,
      ...overrides,
    });
  }
}
