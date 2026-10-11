import { randomUUID } from "node:crypto";

import type { Actor } from "../../src/core/actor";
import { user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { instanceRepository } from "../../src/core/instance";
import { type Employee, employeeRepository, type NewEmployee } from "../../src/modules/employees";
import { parseCalendarDate } from "../../src/utils";

type SeedEmployee = Partial<Omit<NewEmployee, "startDate"> & { startDate: string | null }>;

/**
 * Creates test data by inserting through each module's repository, skipping use
 * cases, so setup does not depend on the code under test. Defaults are unique,
 * normalised demo values; a test sets only the fields it is about.
 */
export class TestSeed {
  #count = 0;

  constructor(private readonly orm: Orm) {}

  async owner({ email = "owner@example.com" } = {}): Promise<Actor> {
    const userId = randomUUID();
    const storedEmail = email.toLowerCase();
    await this.orm.insert(user).values({ id: userId, name: "Owner", email: storedEmail });
    await instanceRepository(this.orm).setOwner(userId, "company");
    return { userId, email: storedEmail, isOwner: true };
  }

  employee({ startDate = null, ...overrides }: SeedEmployee = {}): Promise<Employee> {
    const number = ++this.#count;
    return employeeRepository(this.orm).insert({
      firstName: "Employee",
      lastName: String(number),
      email: `employee${number}@example.com`,
      jobTitle: null,
      startDate: startDate === null ? null : calendarDate(startDate),
      ...overrides,
    });
  }
}

function calendarDate(value: string) {
  const date = parseCalendarDate(value);
  if (!date) {
    throw new Error(`Seed start date ${value} is not a calendar date`);
  }
  return date;
}
