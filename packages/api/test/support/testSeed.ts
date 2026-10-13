import { randomUUID } from "node:crypto";

import type { Actor } from "../../src/core/actor";
import { user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { files } from "../../src/core/files";
import { instanceRepository } from "../../src/core/instance";
import { type Employee, employeeRepository, type NewEmployee } from "../../src/modules/employees";
import { parseCalendarDate } from "../../src/utils";

type SeedEmployee = Partial<
  Omit<NewEmployee, "startDate"> & { startDate: string | null; avatarFileId: string | null }
>;

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
    await this.orm.insert(user).values({ id: userId, name: "Owner", email: email.toLowerCase() });
    await instanceRepository(this.orm).setOwner(userId, "company");
    return { userId, isOwner: true };
  }

  async file({ content, mimeType }: { content: Buffer; mimeType: string }): Promise<string> {
    const [file] = await this.orm
      .insert(files)
      .values({ content, mimeType })
      .returning({ id: files.id });
    return file!.id;
  }

  employee({
    startDate = null,
    avatarFileId = null,
    ...overrides
  }: SeedEmployee = {}): Promise<Employee> {
    const number = ++this.#count;
    return employeeRepository(this.orm).insert({
      firstName: "Employee",
      lastName: String(number),
      email: `employee${number}@example.com`,
      jobTitle: null,
      startDate: startDate === null ? null : calendarDate(startDate),
      avatarFileId,
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
