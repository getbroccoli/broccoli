import { DrizzleQueryError, ilike, or, sql, type SQL } from "drizzle-orm";
import { DatabaseError } from "pg";
import { z } from "zod";

import {
  afterKeyset,
  type KeysetOrder,
  keysetOrder,
  nullsLast,
  type Orm,
  type OrmTransaction,
  orderByKeyset,
} from "../../../core/db";
import { EmailTakenError, type Employee, type NewEmployee } from "../domain";
import { employees } from "./employees-table";

const UNIQUE_VIOLATION = "23505";
const EMAIL_UNIQUE_CONSTRAINT = "employees_email_unique";

export interface EmployeeOrder {
  field: "NAME" | "EMAIL" | "START_DATE";
  direction: "ASC" | "DESC";
}

/** The sort values of the last row seen, as Postgres computed them, behind the order they belong to. */
export type EmployeeKeyset = [field: string, direction: string, ...values: unknown[]];

const KEYSET_VALUES = {
  NAME: [z.string(), z.string(), z.uuid()],
  EMAIL: [z.string(), z.uuid()],
  START_DATE: [z.boolean(), z.string(), z.uuid()],
} as const;

/** Parses the keyset of a cursor; a cursor from another order does not match. */
export function employeeKeyset({ field, direction }: EmployeeOrder): z.ZodType<EmployeeKeyset> {
  return z.tuple([z.literal(field), z.literal(direction), ...KEYSET_VALUES[field]]);
}

export type EmployeeRepository = ReturnType<typeof employeeRepository>;

export interface EmployeePageQuery {
  first: number;
  after: EmployeeKeyset | null;
  order: EmployeeOrder;
  /** Trimmed and non-blank, or null for no filter. */
  search: string | null;
}

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

    /** Up to `first + 1` employees after `after`; the extra one signals a next page. */
    findPage: async ({ first, after, order, search }: EmployeePageQuery) => {
      const columns = keysetColumns(order);
      const keys = Object.fromEntries(
        columns.map(({ expression }, index) => [`key${index}`, expression]),
      );
      const rows = await db
        .select({ employee: employees, ...keys })
        .from(employees)
        .where(
          sql.join(
            [
              sql`true`,
              ...(search ? [matches(search)] : []),
              ...(after ? [afterKeyset(columns, after.slice(2))] : []),
            ],
            sql` and `,
          ),
        )
        .orderBy(...orderByKeyset(columns))
        .limit(first + 1);
      return rows.map((row) => {
        const values = columns.map((_, index) => (row as Record<string, unknown>)[`key${index}`]);
        return {
          node: row.employee,
          keyset: [order.field, order.direction, ...values] satisfies EmployeeKeyset,
        };
      });
    },
  };
}

function keysetColumns({ field, direction }: EmployeeOrder): KeysetOrder {
  const descending = direction === "DESC";
  const by = (expression: SQL) => ({ expression, descending });
  const id = sql`${employees.id}`;
  switch (field) {
    case "NAME":
      return keysetOrder(
        [by(sql`lower(${employees.firstName})`), by(sql`lower(${employees.lastName})`)],
        id,
        descending,
      );
    case "EMAIL":
      return keysetOrder([by(sql`${employees.email}`)], id, descending);
    case "START_DATE":
      // As ISO text, whatever the DateStyle: it sorts like the date, and node-postgres
      // would turn a date into a JS Date.
      return keysetOrder(
        nullsLast(sql`to_char(${employees.startDate}, 'YYYY-MM-DD')`, descending),
        id,
        descending,
      );
  }
}

function matches(search: string): SQL {
  const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return or(
    ilike(employees.firstName, pattern),
    ilike(employees.lastName, pattern),
    ilike(employees.email, pattern),
  )!;
}

function isEmailTaken(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (
    cause instanceof DatabaseError &&
    cause.code === UNIQUE_VIOLATION &&
    cause.constraint === EMAIL_UNIQUE_CONSTRAINT
  );
}
