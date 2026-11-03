import { createFileStorageService, type StoredFile } from "../../../core/files";
import { ApplicationError } from "../../../core/applicationError";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import {
  type Connection,
  type ListArgs,
  type PageArgs,
  paginate,
  parseSearch,
} from "../../../core/pagination";
import { createRecordHistoryReaderService, type HistoryLine } from "../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import type { Tx } from "../../../core/db";
import {
  EMPLOYEE_SORT_VALUES,
  employeeRepository,
  employmentRepository,
  termsRepository,
} from "../db";
import type { Employee, EmployeeOrder, EmployeeOrderField, TermsMembership } from "../domain";
import { employeeRecordType } from "./employeeRecordType";

const fileStorage = createFileStorageService();

export interface EmployeeListArgs extends ListArgs<EmployeeOrderField> {
  filter?: { search?: string | null } | null;
}

/** Reads employees, their start dates, history and avatars, as far as the caller may read them. */
export interface EmployeeReadService {
  /** The employee with this id, or null when there is none. */
  readEmployee: (ctx: SecurityContext, id: string) => Promise<Employee | null>;
  /** The signed-in user's own employee; null for a user without one, such as the owner. */
  readMyEmployee: (ctx: SecurityContext) => Promise<Employee | null>;
  /** The employees the caller may read, sorted by name unless ordered otherwise and filtered, one page at a time. */
  listEmployees: (ctx: SecurityContext, args: EmployeeListArgs) => Promise<Connection<Employee>>;
  /** Each employee's start date, by the id asked for; left out when the caller may not read the employee. */
  readStartDates: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<Map<string, CalendarDate | null>>;
  /**
   * Trusted, for time off: locks existing employees in id order until the transaction ends and
   * returns their ids, so allowance runs and employee changes take turns. Missing employees are left out.
   */
  lockEmployees: (tx: Tx, employeeIds: readonly string[]) => Promise<string[]>;
  /** Trusted: the id of the seeded "England and Wales" terms, which every new employee joins. */
  readEnglandAndWalesTermsId: (tx: Tx) => Promise<string>;
  /**
   * Trusted, for time off: each employee's employments, oldest first, by id, in the caller's
   * transaction. A null start is unknown, a null end open-ended.
   */
  readEmploymentPeriods: (
    tx: Tx,
    employeeIds: readonly string[],
  ) => Promise<Map<string, { startDate: CalendarDate | null; endDate: CalendarDate | null }[]>>;
  /** Trusted, for time off: each employee's terms over time, by id, in the caller's transaction. */
  readTermsMemberships: (
    tx: Tx,
    employeeIds: readonly string[],
  ) => Promise<Map<string, TermsMembership[]>>;
  /**
   * Trusted: the employees on the terms on any date, in the caller's transaction; null when no terms
   * has this id.
   */
  readTermsMemberIds: (tx: Tx, termsId: string) => Promise<string[] | null>;
  /** An employee's history, newest first, also after the employee is deleted; read as `recordHistory` reads it. */
  readEmployeeHistory: (
    ctx: SecurityContext,
    employeeId: string,
    args: PageArgs,
  ) => Promise<Connection<HistoryLine>>;
  /** The avatar file with this id, or null when it is no employee's avatar. */
  readAvatar: (ctx: SecurityContext, fileId: string) => Promise<StoredFile | null>;
}

export function createEmployeeReadService({
  orm,
}: Pick<ModuleDependencies, "orm">): EmployeeReadService {
  const employees = employeeRepository(orm);
  const history = createRecordHistoryReaderService(orm, { employee: employeeRecordType(orm) });
  return {
    async readEmployee(ctx, id) {
      const employeeId = parseUuid(id);
      if (!employeeId) {
        ctx.requireEveryRecord("employee", "read");
        return null;
      }
      await ctx.requireInScope("employee", "read", employeeId);
      return employees.findById(employeeId);
    },
    async readMyEmployee(ctx) {
      const employeeId = ctx.user?.employeeId;
      return employeeId ? employees.findById(employeeId) : null;
    },
    async listEmployees(ctx, { filter, ...listArgs }) {
      const scope = await ctx.recordScope("employee", "read");
      const search = parseSearch(filter?.search);
      return paginate(listArgs, {
        order: DEFAULT_ORDER,
        keysetValues: EMPLOYEE_SORT_VALUES,
        fetch: (query) => employees.findPage({ ...query, search, scope }),
      });
    },
    async readStartDates(ctx, employeeIds) {
      const scope = await ctx.recordScope("employee", "read");
      const asked = employeeIds.flatMap((askedId) => {
        const id = parseUuid(askedId);
        return id && isInRecordScope(scope, id) ? [{ askedId, id }] : [];
      });
      const startDates = await employmentRepository(orm).findStartDates(asked.map(({ id }) => id));
      return new Map(
        asked.flatMap(({ askedId, id }) =>
          startDates.has(id) ? [[askedId, startDates.get(id)!] as const] : [],
        ),
      );
    },
    lockEmployees: (tx, employeeIds) => employeeRepository(tx).lockByIds(employeeIds),
    readEnglandAndWalesTermsId: (tx) => termsRepository(tx).findEnglandAndWalesId(),
    readEmploymentPeriods: (tx, employeeIds) => employmentRepository(tx).findPeriods(employeeIds),
    readTermsMemberships: (tx, employeeIds) => termsRepository(tx).findMemberships(employeeIds),
    async readTermsMemberIds(tx, termsId) {
      const repository = termsRepository(tx);
      return (await repository.exists(termsId)) ? repository.findMemberIds(termsId) : null;
    },
    readEmployeeHistory: (ctx, employeeId, args) =>
      history.readHistory(ctx, "employee", employeeId, args),
    async readAvatar(ctx, fileId) {
      const id = parseUuid(fileId);
      const employeeIds = id ? await employees.findIdsByAvatar(id) : [];
      if (!id || employeeIds.length === 0) {
        ctx.requireEveryRecord("employee", "read");
        return null;
      }
      // Imported people can share a photo: any of them in scope makes it readable.
      const scope = await ctx.recordScope("employee", "read");
      if (!employeeIds.some((employeeId) => isInRecordScope(scope, employeeId))) {
        throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
      }
      return fileStorage.readFile(orm, id);
    },
  };
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };
