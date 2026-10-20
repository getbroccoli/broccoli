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
  insertDemo(demoEmployees: readonly NewDemoEmployee[]): Promise<void>;
  /** Inserts employees, skipping emails another employee has; returns the avatar of each one inserted. */
  insertSkippingTakenEmails(
    newEmployees: readonly EmployeeRow[],
  ): Promise<{ avatarFileId: string | null }[]>;
  /** Deletes every demo employee and their avatars. */
  deleteDemo(): Promise<void>;
  /** Deletes every employee and the demo avatars; an imported avatar stays with the import that stored it. */
  deleteAll(): Promise<void>;
  /** The emails among these that an employee has. */
  findTakenEmails(emails: readonly string[]): Promise<string[]>;
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

    insertDemo: async (demoEmployees: readonly NewDemoEmployee[]): Promise<void> => {
      const rows: EmployeeRow[] = [];
      for (const { employee, avatar } of demoEmployees) {
        const avatarFileId = await storeFile(db, {
          content: avatar.bytes,
          mimeType: avatar.mimeType,
        });
        rows.push({ ...employee, avatarFileId, isDemo: true });
      }
      try {
        await orm().insert(employees).values(rows);
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    insertSkippingTakenEmails: async (newEmployees: readonly EmployeeRow[]) => {
      const inserted: { avatarFileId: string | null }[] = [];
      for (let start = 0; start < newEmployees.length; start += INSERT_BATCH_SIZE) {
        const rows = await orm()
          .insert(employees)
          .values(newEmployees.slice(start, start + INSERT_BATCH_SIZE))
          .onConflictDoNothing({ target: employees.email })
          .returning({ avatarFileId: employees.avatarFileId });
        inserted.push(...rows);
      }
      return inserted;
    },

    deleteDemo: async (): Promise<void> => {
      await deleteDemoAvatars(
        db,
        await orm().delete(employees).where(eq(employees.isDemo, true)).returning(avatarColumns),
      );
    },

    deleteAll: async (): Promise<void> => {
      await deleteDemoAvatars(db, await orm().delete(employees).returning(avatarColumns));
    },

    findTakenEmails: async (emails: readonly string[]): Promise<string[]> => {
      const rows = await orm()
        .select({ email: employees.email })
        .from(employees)
        // One array parameter: `inArray` binds one per email, and Postgres takes at most 65,535.
        .where(sql`${employees.email} = any(${sql.param([...emails])}::text[])`);
      return rows.map(({ email }) => email);
    },

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

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

const avatarColumns = { avatarFileId: employees.avatarFileId, isDemo: employees.isDemo };

/** Deletes the avatars of the deleted demo employees, whose rows no longer reference them. */
async function deleteDemoAvatars(
  db: Orm | Tx,
  deleted: { avatarFileId: string | null; isDemo: boolean }[],
): Promise<void> {
  await deleteFiles(
    db,
    deleted.flatMap(({ avatarFileId, isDemo }) => (isDemo && avatarFileId ? [avatarFileId] : [])),
  );
}

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
