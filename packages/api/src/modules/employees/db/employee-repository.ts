import { DrizzleQueryError, sql } from "drizzle-orm";
import { DatabaseError } from "pg";

import type { Orm } from "../../../core/db";
import { EmailTakenError, type EmployeeKeyset, type EmployeeRepository } from "../app";
import { employees } from "./employees-table";

const UNIQUE_VIOLATION = "23505";
const EMAIL_UNIQUE_CONSTRAINT = "employees_email_unique";

const firstNameKey = sql<string>`lower(${employees.firstName})`;
const lastNameKey = sql<string>`lower(${employees.lastName})`;

export function createEmployeeRepository(orm: Orm): EmployeeRepository {
  return {
    insert: async (newEmployee) => {
      try {
        const [employee] = await orm.insert(employees).values(newEmployee).returning();
        return employee!;
      } catch (error) {
        throw isEmailTaken(error) ? new EmailTakenError() : error;
      }
    },

    findPage: async ({ first, after }) => {
      // One extra row tells whether another page follows.
      const rows = await orm
        .select({ employee: employees, firstNameKey, lastNameKey })
        .from(employees)
        .where(
          after
            ? sql`(${firstNameKey}, ${lastNameKey}, ${employees.id}) > ${row(after)}`
            : undefined,
        )
        .orderBy(firstNameKey, lastNameKey, employees.id)
        .limit(first + 1);
      return {
        rows: rows.slice(0, first).map(({ employee, firstNameKey, lastNameKey }) => ({
          employee,
          keyset: [firstNameKey, lastNameKey, employee.id],
        })),
        hasNextPage: rows.length > first,
      };
    },
  };
}

function row([firstName, lastName, id]: EmployeeKeyset) {
  return sql`(${firstName}, ${lastName}, ${id}::uuid)`;
}

function isEmailTaken(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (
    cause instanceof DatabaseError &&
    cause.code === UNIQUE_VIOLATION &&
    cause.constraint === EMAIL_UNIQUE_CONSTRAINT
  );
}
