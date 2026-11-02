import type { Orm, Tx } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { RasterImage } from "../../../utils";
import { employeeRepository, employmentRepository, locationRepository } from "../db";
import {
  type Employee,
  type NewEmployeeInput,
  parseNewEmployee,
  tryParseNewEmployee,
} from "../domain";
import { setNewEmployeeManagers } from "./employeeManagerService";
import { recordCreatedEmployees } from "./recordCreatedEmployees";

const owners = createOwnerService();
const recordHistory = createRecordHistoryService();

/** What adding imported employees did. */
export interface ImportedEmployees {
  created: number;
  /** Inputs that do not make an employee, such as one without a last name. */
  incomplete: number;
  /** Inputs whose email an employee already has; among inputs with one email, the first wins. */
  emailTaken: number;
}

/**
 * An employee an import proposes, with the stored photo it brings as its avatar, the email of
 * their manager among the same inputs, the name of their location and, for the owner's own
 * person, the owner's user.
 */
export type ImportedEmployeeInput = NewEmployeeInput & {
  avatarFileId?: string;
  managerEmail?: string | null;
  /** Matched to a location by name ignoring case, or a new location. */
  locationName?: string | null;
  userId?: string;
};

/** A demo employee, their avatar, the email of their manager among the demo employees and their location's name. */
export interface DemoEmployee {
  employee: NewEmployeeInput;
  avatar: RasterImage;
  managerEmail?: string | null;
  locationName?: string | null;
}

/** The employees setup adds, keeps or clears in bulk, joining the caller's `db` or `tx`. */
export interface EmployeeSetupService {
  /**
   * Adds employees proposed by an import, with `cause` on their creation lines; skips the ones
   * that do not parse or whose email is taken. Puts each in the location its name matches, adding
   * the locations no one has yet. Returns the counts and each new employee's id by email.
   */
  createImportedEmployees: (
    ctx: SecurityContext,
    tx: Tx,
    inputs: readonly ImportedEmployeeInput[],
    cause: HistoryAppend["cause"],
  ) => Promise<ImportedEmployees & { idsByEmail: ReadonlyMap<string, string> }>;
  /**
   * Adds the demo employees with their avatars to an instance without employees, with `cause`
   * on their creation lines; otherwise does nothing.
   */
  createDemoEmployees: (
    ctx: SecurityContext,
    tx: Tx,
    demoEmployees: readonly DemoEmployee[],
    cause: HistoryAppend["cause"],
  ) => Promise<void>;
  /** Whether the instance holds demo employees, such as when setup leaves the demo. */
  hasDemoEmployees: (ctx: SecurityContext, db: Orm | Tx) => Promise<boolean>;
  /** The emails among these that an employee already has, so an import adds no one with them. */
  findTakenEmails: (
    ctx: SecurityContext,
    db: Orm | Tx,
    emails: readonly string[],
  ) => Promise<Set<string>>;
  /** Employees with stored avatars, so cleanup can preserve the files they use. */
  findEmployeesWithAvatars: (ctx: SecurityContext, db: Orm | Tx) => Promise<Employee[]>;
  /**
   * Deletes every employee, all their history and every location when setup or the demo goes back
   * to its start, keeping the owner's account: what was there leaves no trace, unlike an ordinary
   * removal.
   */
  deleteAllEmployees: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}

export function createEmployeeSetupService(): EmployeeSetupService {
  return {
    async createImportedEmployees(ctx, tx, inputs, cause) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const managerEmails = new Map<string, string>();
      const parsed = inputs.flatMap(
        ({ avatarFileId, managerEmail, locationName, userId, ...input }) => {
          const employee = tryParseNewEmployee(input);
          if (employee && managerEmail) {
            managerEmails.set(employee.email, managerEmail);
          }
          return employee
            ? [
                {
                  employee: {
                    ...employee,
                    avatarFileId: avatarFileId ?? null,
                    userId: userId ?? null,
                  },
                  locationName,
                },
              ]
            : [];
        },
      );
      const newEmployees = await placeInLocations(tx, parsed);
      const created = await employeeRepository(tx).insertSkippingTakenEmails(newEmployees);
      const managers = await setNewEmployeeManagers(tx, created, managerEmails);
      await recordCreatedEmployees(ctx, tx, created, cause, managers);
      return {
        created: created.length,
        incomplete: inputs.length - newEmployees.length,
        emailTaken: newEmployees.length - created.length,
        idsByEmail: new Map(created.map(({ id, email }) => [email, id])),
      };
    },
    async createDemoEmployees(ctx, tx, demoEmployees, cause) {
      ctx.require("MANAGE_WORKSPACE");
      if (await employeeRepository(tx).hasAny()) {
        return;
      }
      const placed = await placeInLocations(
        tx,
        demoEmployees.map(({ employee, locationName }) => ({
          employee: parseNewEmployee(employee),
          locationName,
        })),
      );
      const employees = await employeeRepository(tx).insertDemo(
        placed.map((employee, index) => ({ employee, avatar: demoEmployees[index]!.avatar })),
      );
      const managerEmails = new Map(
        demoEmployees.flatMap(({ employee, managerEmail }) =>
          managerEmail ? [[employee.email, managerEmail] as const] : [],
        ),
      );
      const managers = await setNewEmployeeManagers(tx, employees, managerEmails);
      await recordCreatedEmployees(ctx, tx, employees, cause, managers);
    },
    hasDemoEmployees(ctx, db) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      return employeeRepository(db).hasDemo();
    },
    async findTakenEmails(ctx, db, emails) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      return new Set(await employeeRepository(db).findTakenEmails(emails));
    },
    findEmployeesWithAvatars(ctx, db) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      return employeeRepository(db).findWithAvatars();
    },
    async deleteAllEmployees(ctx, tx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      // Before the employees table, in the order a manager change takes them, so the two cannot deadlock.
      await employmentRepository(tx).lockForWrites();
      // The owner keeps their user, so they stay signed in.
      const owner = await owners.readOwner(tx);
      await employeeRepository(tx).deleteAll(owner?.userId ?? null);
      // After the delete, which waits for any update holding an employee row, so its line goes too.
      await recordHistory.purge(tx, "employee");
      await locationRepository(tx).deleteAll();
    },
  };
}

/** Each employee with the id of the location its name matches, adding the locations no one has yet. */
async function placeInLocations<T extends object>(
  tx: Tx,
  employees: readonly { employee: T; locationName?: string | null }[],
): Promise<(T & { locationId: string | null })[]> {
  const names = employees.flatMap(({ locationName }) => locationName?.trim() || []);
  const locations = await locationRepository(tx).findOrCreate(names);
  return employees.map(({ employee, locationName }) => ({
    ...employee,
    locationId: locationName?.trim() ? locations.get(locationName.trim())!.id : null,
  }));
}
