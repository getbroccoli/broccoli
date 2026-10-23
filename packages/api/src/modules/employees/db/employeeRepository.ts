import { eq, getTableColumns, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
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
import { deleteFiles, storeFile } from "../../../core/files";
import type { KeysetQuery, KeysetRow } from "../../../core/pagination";
import type { RasterImage } from "../../../utils";
import {
  EmailTakenError,
  type Employee,
  type EmployeeOrder,
  type EmployeeOrderField,
  type NewEmployee,
} from "../domain";
import { employees } from "./employeesTable";

/** Employees stored in Postgres, through the pool or inside a transaction. */
export interface EmployeeRepository {
  /** Throws `EmailTakenError` when another employee has the email. */
  insert(newEmployee: EmployeeRow): Promise<Employee>;
  /** Inserts demo employees with their avatars in one statement; throws `EmailTakenError` like `insert`. */
  insertDemo(demoEmployees: readonly NewDemoEmployee[]): Promise<Employee[]>;
  /** Inserts employees, skipping emails another employee has; returns the inserted ones. */
  insertSkippingTakenEmails(newEmployees: readonly EmployeeRow[]): Promise<Employee[]>;
  /**
   * Changes an employee's fields in one statement and returns the employee before and after it,
   * as Postgres replaced it under the row's lock; null when no employee has the id. Throws
   * `EmailTakenError` like `insert`.
   */
  update(
    id: string,
    changes: Partial<NewEmployee>,
  ): Promise<{ before: Employee; after: Employee } | null>;
  /** Deletes an employee and their avatar and returns what was deleted; null when no employee has the id. */
  delete(id: string): Promise<Employee | null>;
  findById(id: string): Promise<Employee | null>;
  /** Deletes every employee and their avatars; a file another row still references fails it. */
  deleteAll(): Promise<void>;
  /** The emails among these that an employee has. */
  findTakenEmails(emails: readonly string[]): Promise<string[]>;
  /** Every employee with a stored avatar. */
  findWithAvatars(): Promise<Employee[]>;
  hasAny(): Promise<boolean>;
  hasDemo(): Promise<boolean>;
  /** Whether an employee's avatar is this file. */
  hasAvatar(fileId: string): Promise<boolean>;
  /** Up to `limit` employees after `after`, with their sort values as Postgres computed them. */
  findPage(query: EmployeePageQuery): Promise<KeysetRow<Employee, unknown[]>[]>;
}

const EMAIL_UNIQUE_CONSTRAINT = "employees_email_unique";

/** The sort values of an employee in each order, as `findPage` returns them. */
export const EMPLOYEE_SORT_VALUES: Record<EmployeeOrderField, z.ZodType<unknown[]>> = {
  NAME: z.tuple([z.string(), z.string(), z.uuid()]),
  EMAIL: z.tuple([z.string(), z.uuid()]),
  START_DATE: z.tuple([z.boolean(), z.string(), z.uuid()]),
};

export interface EmployeePageQuery extends KeysetQuery<EmployeeOrderField, unknown[]> {
  /** Trimmed and non-blank, or null for no filter. */
  search: string | null;
}

/** A demo employee to insert, with the avatar to store for them. */
export interface NewDemoEmployee {
  employee: NewEmployee;
  avatar: RasterImage;
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

    insertDemo: async (demoEmployees: readonly NewDemoEmployee[]): Promise<Employee[]> => {
      const rows: EmployeeRow[] = [];
      for (const { employee, avatar } of demoEmployees) {
        const avatarFileId = await storeFile(db, {
          content: avatar.bytes,
          mimeType: avatar.mimeType,
        });
        rows.push({ ...employee, avatarFileId, isDemo: true });
      }
      try {
        return await orm().insert(employees).values(rows).returning();
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    insertSkippingTakenEmails: async (newEmployees: readonly EmployeeRow[]) => {
      const inserted: Employee[] = [];
      for (let start = 0; start < newEmployees.length; start += INSERT_BATCH_SIZE) {
        const rows = await orm()
          .insert(employees)
          .values(newEmployees.slice(start, start + INSERT_BATCH_SIZE))
          .onConflictDoNothing({ target: employees.email })
          .returning();
        inserted.push(...rows);
      }
      return inserted;
    },

    update: async (id: string, changes: Partial<NewEmployee>) => {
      try {
        const [row] = await orm()
          .update(employees)
          .set(changes)
          .where(eq(employees.id, id))
          .returning({ ...getTableColumns(employees), ...OLD_VALUES });
        if (!row) {
          return null;
        }
        const { oldFirstName, oldLastName, oldEmail, oldJobTitle, oldStartDate, ...after } = row;
        const before = {
          ...after,
          firstName: oldFirstName,
          lastName: oldLastName,
          email: oldEmail,
          jobTitle: oldJobTitle,
          startDate: oldStartDate,
        };
        return { before, after };
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    delete: async (id: string): Promise<Employee | null> => {
      const [employee] = await orm().delete(employees).where(eq(employees.id, id)).returning();
      if (employee?.avatarFileId) {
        await deleteFiles(db, [employee.avatarFileId]);
      }
      return employee ?? null;
    },

    findById: async (id: string): Promise<Employee | null> => {
      const [employee] = await orm().select().from(employees).where(eq(employees.id, id));
      return employee ?? null;
    },

    deleteAll: async (): Promise<void> => {
      const deleted = await orm()
        .delete(employees)
        .returning({ avatarFileId: employees.avatarFileId });
      await deleteFiles(
        db,
        deleted.flatMap(({ avatarFileId }) => (avatarFileId ? [avatarFileId] : [])),
      );
    },

    findTakenEmails: async (emails: readonly string[]): Promise<string[]> => {
      const rows = await orm()
        .select({ email: employees.email })
        .from(employees)
        // One array parameter: `inArray` binds one per email, and Postgres takes at most 65,535.
        .where(sql`${employees.email} = any(${sql.param([...emails])}::text[])`);
      return rows.map(({ email }) => email);
    },

    findWithAvatars: () => orm().select().from(employees).where(isNotNull(employees.avatarFileId)),

    hasAny: () => exists(orm(), sql`true`),

    hasDemo: () => exists(orm(), eq(employees.isDemo, true)),

    hasAvatar: (fileId: string) => exists(orm(), eq(employees.avatarFileId, fileId)),

    findPage: async ({ order, after, limit, search }: EmployeePageQuery) => {
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
              ...(after ? [afterKeyset(columns, after)] : []),
            ],
            sql` and `,
          ),
        )
        .orderBy(...orderByKeyset(columns))
        .limit(limit);
      return rows.map((row) => ({
        node: row.employee,
        values: columns.map((_, index) => (row as Record<string, unknown>)[`key${index}`]),
      }));
    },
  };
}

/** The fields an update changes, as `UPDATE … RETURNING` saw them before the update (Postgres 18). */
const OLD_VALUES = {
  oldFirstName: sql`old.first_name`.mapWith(employees.firstName),
  oldLastName: sql`old.last_name`.mapWith(employees.lastName),
  oldEmail: sql`old.email`.mapWith(employees.email),
  oldJobTitle: sql`old.job_title`.mapWith(employees.jobTitle),
  oldStartDate: sql`old.start_date`.mapWith(employees.startDate),
};

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
    ilike(sql`${employees.firstName} || ' ' || ${employees.lastName}`, pattern),
    ilike(employees.email, pattern),
  )!;
}
