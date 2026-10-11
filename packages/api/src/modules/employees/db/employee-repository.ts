import { DrizzleQueryError, sql } from "drizzle-orm";
import { DatabaseError } from "pg";
import { z } from "zod";

import type { Orm, OrmTransaction } from "../../../core/db";
import { EmailTakenError, type Employee, type NewEmployee } from "../domain";
import { employees } from "./employees-table";

const UNIQUE_VIOLATION = "23505";
const EMAIL_UNIQUE_CONSTRAINT = "employees_email_unique";

const firstNameKey = sql<string>`lower(${employees.firstName})`;
const lastNameKey = sql<string>`lower(${employees.lastName})`;

/**
 * An employee's place in the list order: lowercased first name, lowercased last
 * name, id. Lowercased by Postgres, so it compares exactly like the stored order.
 */
export const employeeKeyset = z.tuple([z.string(), z.string(), z.uuid()]);

export type EmployeeKeyset = z.infer<typeof employeeKeyset>;

export type EmployeeRepository = ReturnType<typeof employeeRepository>;

/** Employees stored in Postgres, through the pool or inside a transaction. */
export function employeeRepository(db: Orm | OrmTransaction) {
  return {
    /** Throws `EmailTakenError` when another employee has the email. */
    insert: async (newEmployee: NewEmployee): Promise<Employee> => {
      try {
        const [employee] = await db.insert(employees).values(newEmployee).returning();
        return employee!;
      } catch (error) {
        throw isEmailTaken(error) ? new EmailTakenError() : error;
      }
    },

    /** Up to `first + 1` employees in list order after `after`; the extra one signals a next page. */
    findPage: async ({ first, after }: { first: number; after: EmployeeKeyset | null }) => {
      const rows = await db
        .select({ employee: employees, firstNameKey, lastNameKey })
        .from(employees)
        .where(
          after
            ? sql`(${firstNameKey}, ${lastNameKey}, ${employees.id}) > ${row(after)}`
            : undefined,
        )
        .orderBy(firstNameKey, lastNameKey, employees.id)
        .limit(first + 1);
      return rows.map(({ employee, firstNameKey, lastNameKey }) => ({
        node: employee,
        keyset: [firstNameKey, lastNameKey, employee.id] satisfies EmployeeKeyset,
      }));
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
