import { eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  afterKeyset,
  containsPattern,
  isUniqueViolation,
  type KeysetOrder,
  keysetOrder,
  nullsLast,
  type Orm,
  ormOf,
  orderByKeyset,
  type Tx,
} from "../../../core/db";
import { EmailTakenError, type Employee, type NewEmployee } from "../domain";
import { employees } from "./employeesTable";

/** Employees stored in Postgres, through the pool or inside a transaction. */
export interface EmployeeRepository {
  /** Throws `EmailTakenError` when another employee has the email. */
  insert(newEmployee: EmployeeRow): Promise<Employee>;
  /** Inserts employees in one statement; throws `EmailTakenError` like `insert`. */
  insertMany(newEmployees: readonly EmployeeRow[]): Promise<void>;
  /** Inserts employees, skipping emails another employee has; returns how many were inserted. */
  insertSkippingTakenEmails(newEmployees: readonly EmployeeRow[]): Promise<number>;
  /** Deletes every demo employee; returns the ids of the avatar files they owned. */
  deleteDemo(): Promise<string[]>;
  hasAny(): Promise<boolean>;
  hasDemo(): Promise<boolean>;
  /** Whether an employee's avatar is this file. */
  hasAvatar(fileId: string): Promise<boolean>;
  /** Up to `first + 1` employees after `after`; the extra one signals a next page. */
  findPage(query: EmployeePageQuery): Promise<{ node: Employee; keyset: EmployeeKeyset }[]>;
}

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

export interface EmployeePageQuery {
  first: number;
  after: EmployeeKeyset | null;
  order: EmployeeOrder;
  /** Trimmed and non-blank, or null for no filter. */
  search: string | null;
}

export function employeeRepository(db: Orm | Tx): EmployeeRepository {
  const orm = () => ormOf(db);

  return {
    insert: async (newEmployee: EmployeeRow): Promise<Employee> => {
      try {
        const [employee] = await orm().insert(employees).values(newEmployee).returning();
        return employee!;
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    insertMany: async (newEmployees: readonly EmployeeRow[]): Promise<void> => {
      try {
        await orm()
          .insert(employees)
          .values([...newEmployees]);
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    insertSkippingTakenEmails: async (newEmployees: readonly EmployeeRow[]): Promise<number> => {
      let inserted = 0;
      for (let start = 0; start < newEmployees.length; start += INSERT_BATCH_SIZE) {
        const rows = await orm()
          .insert(employees)
          .values(newEmployees.slice(start, start + INSERT_BATCH_SIZE))
          .onConflictDoNothing({ target: employees.email })
          .returning({ id: employees.id });
        inserted += rows.length;
      }
      return inserted;
    },

    deleteDemo: async (): Promise<string[]> => {
      const rows = await orm()
        .delete(employees)
        .where(eq(employees.isDemo, true))
        .returning({ avatarFileId: employees.avatarFileId });
      return rows.flatMap(({ avatarFileId }) => (avatarFileId ? [avatarFileId] : []));
    },

    hasAny: () => exists(orm(), sql`true`),

    hasDemo: () => exists(orm(), eq(employees.isDemo, true)),

    hasAvatar: (fileId: string) => exists(orm(), eq(employees.avatarFileId, fileId)),

    findPage: async ({ first, after, order, search }: EmployeePageQuery) => {
      const columns = keysetColumns(order);
      const keys = Object.fromEntries(
        columns.map(({ expression }, index) => [`key${index}`, expression]),
      );
      const rows = await orm()
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

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

/** A new employee as stored, with the columns only the module itself sets. */
type EmployeeRow = NewEmployee & Partial<Pick<Employee, "avatarFileId">> & { isDemo?: boolean };

async function exists(orm: ReturnType<typeof ormOf>, condition: SQL | undefined): Promise<boolean> {
  const rows = await orm.select({ id: employees.id }).from(employees).where(condition).limit(1);
  return rows.length > 0;
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
  const pattern = containsPattern(search);
  return or(
    ilike(employees.firstName, pattern),
    ilike(employees.lastName, pattern),
    ilike(employees.email, pattern),
  )!;
}
