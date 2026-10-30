import { and, eq, ilike, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
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
import { user } from "../../../core/auth";
import { deleteFiles, storeFile } from "../../../core/files";
import { inRecordScope, type RecordScope } from "../../../core/security";
import type { KeysetQuery, KeysetRow } from "../../../core/pagination";
import type { CalendarDate, RasterImage } from "../../../utils";
import {
  EmailTakenError,
  type Employee,
  type EmployeeOrder,
  type EmployeeOrderField,
  type NewEmployee,
} from "../domain";
import { employees } from "./employeesTable";
import { employmentRepository, firstEmploymentOf } from "./employmentRepository";
import { employments } from "./employmentsTable";

/** Employees stored in Postgres, through the pool or inside a transaction, which inserts need. */
export interface EmployeeRepository {
  /** Throws `EmailTakenError` when another employee has the email. */
  insert(newEmployee: EmployeeRow): Promise<Employee>;
  /** Inserts demo employees with their avatars in one statement; throws `EmailTakenError` like `insert`. */
  insertDemo(demoEmployees: readonly NewDemoEmployee[]): Promise<Employee[]>;
  /** Inserts employees, skipping emails another employee has; returns the inserted ones. */
  insertSkippingTakenEmails(newEmployees: readonly EmployeeRow[]): Promise<Employee[]>;
  /**
   * Changes an employee's fields under the row's lock and returns the employee before and after;
   * null when no employee has the id. Throws `EmailTakenError` like `insert`.
   */
  update(
    id: string,
    changes: Partial<EmployeeFields>,
  ): Promise<{ before: Employee; after: Employee } | null>;
  /**
   * Deletes an employee, their avatar and the user who signs in as them, and returns what was
   * deleted; null when no employee has the id.
   */
  delete(id: string): Promise<Employee | null>;
  findById(id: string): Promise<Employee | null>;
  /** Holds these employees' rows until the caller commits, so changes to one person take turns. */
  lockByIds(ids: readonly string[]): Promise<void>;
  /** Links the user who signs in as this employee. */
  linkUser(id: string, userId: string): Promise<void>;
  /** The employee linked to this user, or null. */
  findByUserId(userId: string): Promise<Employee | null>;
  /** The employees among these ids that exist. */
  findByIds(ids: readonly string[]): Promise<Employee[]>;
  /**
   * Deletes every employee, their avatars and the users who sign in as them, but `keptUserId`,
   * locking out other employee writes until the caller commits; a file another row still
   * references fails it.
   */
  deleteAll(keptUserId: string | null): Promise<void>;
  /** The emails among these that an employee has. */
  findTakenEmails(emails: readonly string[]): Promise<string[]>;
  /** Every employee with a stored avatar. */
  findWithAvatars(): Promise<Employee[]>;
  hasAny(): Promise<boolean>;
  hasDemo(): Promise<boolean>;
  /** The employees whose avatar is this file. */
  findIdsByAvatar(fileId: string): Promise<string[]>;
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
  /** The employees the caller may read; `inRecordScope` refuses "none". */
  scope: RecordScope;
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
      await employmentRepository(db).lockForWrites();
      try {
        const inserted = await orm().insert(employees).values(newEmployee).returning();
        const [employee] = await openEmployments(db, inserted, [newEmployee]);
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
      await employmentRepository(db).lockForWrites();
      try {
        const inserted = await orm().insert(employees).values(rows).returning();
        return await openEmployments(db, inserted, rows);
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
    },

    insertSkippingTakenEmails: async (newEmployees: readonly EmployeeRow[]) => {
      await employmentRepository(db).lockForWrites();
      const inserted: Employee[] = [];
      for (let start = 0; start < newEmployees.length; start += INSERT_BATCH_SIZE) {
        const batch = newEmployees.slice(start, start + INSERT_BATCH_SIZE);
        const rows = await orm()
          .insert(employees)
          .values(batch)
          .onConflictDoNothing({ target: employees.email })
          .returning();
        inserted.push(...(await openEmployments(db, rows, batch)));
      }
      return inserted;
    },

    update: async (id: string, changes: Partial<EmployeeFields>) => {
      await employmentRepository(db).lockForWrites();
      // Locked before it is read, so the read sees a change committed while it waited.
      await lockEmployees(orm(), [id]);
      const [before] = await orm().select().from(employees).where(eq(employees.id, id));
      if (!before) {
        return null;
      }
      try {
        await orm().update(employees).set(changes).where(eq(employees.id, id));
      } catch (error) {
        throw isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT) ? new EmailTakenError() : error;
      }
      // The changes are normalised as stored, so the stored employee is the old one with them.
      return { before, after: { ...before, ...changes } };
    },

    delete: async (id: string): Promise<Employee | null> => {
      const [employee] = await orm().delete(employees).where(eq(employees.id, id)).returning();
      if (employee?.avatarFileId) {
        await deleteFiles(db, [employee.avatarFileId]);
      }
      if (employee?.userId) {
        // Their sessions, password and profiles go with the user.
        await orm().delete(user).where(eq(user.id, employee.userId));
      }
      return employee ?? null;
    },

    findById: async (id: string): Promise<Employee | null> => {
      const [employee] = await orm().select().from(employees).where(eq(employees.id, id));
      return employee ?? null;
    },

    lockByIds: (ids) => lockEmployees(orm(), ids),

    linkUser: async (id, userId) => {
      await orm().update(employees).set({ userId }).where(eq(employees.id, id));
    },

    findByUserId: async (userId) => {
      const [employee] = await orm().select().from(employees).where(eq(employees.userId, userId));
      return employee ?? null;
    },

    deleteAll: async (keptUserId): Promise<void> => {
      // Holds back concurrent inserts and updates until the caller commits, so none lands between
      // this delete and the caller's purge of employee history.
      await orm().execute(sql`lock table ${employees} in share row exclusive mode`);
      const deleted = await orm()
        .delete(employees)
        .returning({ avatarFileId: employees.avatarFileId, userId: employees.userId });
      await deleteFiles(
        db,
        deleted.flatMap(({ avatarFileId }) => (avatarFileId ? [avatarFileId] : [])),
      );
      const userIds = deleted.flatMap(({ userId }) => (userId ? [userId] : []));
      if (userIds.length > 0) {
        await orm()
          .delete(user)
          .where(and(inArray(user.id, userIds), keptUserId ? ne(user.id, keptUserId) : undefined));
      }
    },

    findByIds: (ids: readonly string[]) =>
      orm()
        .select()
        .from(employees)
        .where(sql`${employees.id} = any(${sql.param([...ids])}::uuid[])`),

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

    findIdsByAvatar: async (fileId: string) => {
      const rows = await orm()
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.avatarFileId, fileId));
      return rows.map(({ id }) => id);
    },

    findPage: async ({ order, after, limit, search, scope }: EmployeePageQuery) => {
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
              inRecordScope(scope, employees.id),
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

/** A new employee as stored, with the columns only the module itself sets. */
type EmployeeRow = NewEmployee &
  Partial<Pick<Employee, "avatarFileId" | "userId">> & { isDemo?: boolean };

/** The fields an update changes on the employee's own row; the start date is on their employments. */
type EmployeeFields = Omit<NewEmployee, "startDate">;

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
        nullsLast(
          sql`to_char(${firstEmploymentOf(employees.id, employments.startDate)}, 'YYYY-MM-DD')`,
          descending,
        ),
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

/**
 * Opens an open-ended employment for each inserted employee, starting on the start date of the
 * row that inserted them, and returns the employees.
 */
async function openEmployments(
  db: Orm | Tx,
  inserted: Employee[],
  rows: readonly EmployeeRow[],
): Promise<Employee[]> {
  const startDates = new Map<string, CalendarDate | null>();
  for (const { email, startDate } of rows) {
    // The first row with an email is the one inserted; a later one was skipped.
    if (!startDates.has(email)) {
      startDates.set(email, startDate);
    }
  }
  await employmentRepository(db).insertOpen(
    inserted.map(({ id, email }) => ({ employeeId: id, startDate: startDates.get(email) ?? null })),
  );
  return inserted;
}

async function lockEmployees(orm: ReturnType<typeof ormOf>, ids: readonly string[]) {
  // In id order, so two callers locking overlapping people cannot deadlock.
  await orm
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.id, [...ids]))
    .orderBy(employees.id)
    .for("update");
}
