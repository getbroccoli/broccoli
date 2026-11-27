import DataLoader from "dataloader";

import { type GraphqlContext, perRequest } from "../../../core/graphql";
import type { ActingAsService } from "../../../core/instance";
import { createWriteModeService, type WriteMode } from "../../../core/records";
import type { PermissionObject, PermissionProfile, SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import type {
  EmployeeInviteService,
  EmployeeManagerService,
  EmployeePermissionService,
  EmployeeReadService,
  EmployeeWorkingPatternService,
  EmploymentTerms,
  LocationService,
  LocationWithPeopleCount,
  TermsOverview,
  TermsService,
} from "../app";
import type { Employee, SignInStatus } from "../domain";

/** One request's loaders for employee data. */
export interface EmployeeLoaders {
  /** An employee's manager today, or null without one. */
  manager: DataLoader<string, Employee | null>;
  /** An employee's start date: the start of their first employment. */
  startDate: DataLoader<string, CalendarDate | null>;
  /** The profiles of the user who signs in as an employee, or null without one. */
  permissionProfiles: DataLoader<string, PermissionProfile[] | null>;
  /** Whether a person can sign in, and their invite. */
  signInStatus: DataLoader<string, SignInStatus | null>;
  /** Whether the caller may act as an employee now. */
  actable: DataLoader<string, boolean>;
  /** A location by id; every location is read once per request, since a company has few. */
  location: DataLoader<string, LocationWithPeopleCount | null>;
  /**
   * A set of terms by id, or the default terms by `DEFAULT_TERMS`; every set is read once per
   * request, since a company has few. Admins only.
   */
  terms: DataLoader<string, TermsOverview | null>;
  /** A person's terms and working week, or null for a caller who may not read them. */
  employmentTerms: DataLoader<string, EmploymentTerms | null>;
  /** An employee by id, with the caller's access, or null; for the people a task names. */
  employee: DataLoader<string, Employee | null>;
  /** How the caller may create a record of a type about an employee; one read per type. */
  createMode: DataLoader<CreateKey, WriteMode, string>;
}

/** The module's services the loaders read through. */
type LoadedServices = EmployeeReadService &
  EmployeeManagerService &
  EmployeePermissionService &
  LocationService &
  TermsService &
  EmployeeWorkingPatternService;

const writeModes = createWriteModeService();

/** The `terms` loader's key for the default terms, which a location without terms starts people on. */
export const DEFAULT_TERMS = "default";

/** One request's loaders: related data in one query per list, not one per item. Create once, in `createResolvers`. */
export function employeeLoaders(
  services: LoadedServices,
  invites: EmployeeInviteService,
  actingAs: ActingAsService,
): (context: GraphqlContext) => EmployeeLoaders {
  return perRequest((context) => ({
    employee: new DataLoader<string, Employee | null>(async (employeeIds) => {
      const found = await services.readEmployees(context.getActor(), employeeIds);
      return employeeIds.map((id) => found.get(id) ?? null);
    }),
    manager: new DataLoader<string, Employee | null>(async (employeeIds) => {
      const managers = await services.readManagers(context.getActor(), employeeIds);
      return employeeIds.map((id) => managers.get(id) ?? null);
    }),
    startDate: new DataLoader<string, CalendarDate | null>(async (employeeIds) => {
      const startDates = await services.readStartDates(context.getActor(), employeeIds);
      return employeeIds.map((id) => startDates.get(id) ?? null);
    }),
    permissionProfiles: new DataLoader<string, PermissionProfile[] | null>(async (employeeIds) => {
      const profiles = await services.readPermissionProfiles(context.getActor(), employeeIds);
      return employeeIds.map((id) => profiles.get(id) ?? null);
    }),
    signInStatus: new DataLoader<string, SignInStatus | null>(async (employeeIds) => {
      const statuses = await invites.readStatuses(context.getActor(), employeeIds);
      return employeeIds.map((id) => statuses.get(id) ?? null);
    }),
    actable: actableLoader(actingAs, context.getActor()),
    location: new DataLoader<string, LocationWithPeopleCount | null>(async (locationIds) => {
      const locations = await services.listLocations(context.getActor());
      return locationIds.map((id) => locations.find((location) => location.id === id) ?? null);
    }),
    terms: new DataLoader<string, TermsOverview | null>(async (keys) => {
      const allTerms = await services.listTerms(context.getActor());
      return keys.map(
        (key) =>
          allTerms.find((terms) => (key === DEFAULT_TERMS ? terms.isDefault : terms.id === key)) ??
          null,
      );
    }),
    employmentTerms: new DataLoader<string, EmploymentTerms | null>(async (employeeIds) => {
      const read = await services.readEmploymentTerms(context.getActor(), { employeeIds });
      return employeeIds.map((id) => read.get(id) ?? null);
    }),
    createMode: createModeLoader(context.getActor()),
  }));
}

/** `actable`: whom the caller may act as, in one read for every employee a request asks about. */
function actableLoader(
  actingAs: ActingAsService,
  ctx: SecurityContext,
): DataLoader<string, boolean> {
  return new DataLoader(async (employeeIds) => {
    const actable = await actingAs.actableEmployees(ctx, employeeIds);
    return employeeIds.map((id) => actable.has(id));
  });
}

/** `createMode`: one write-modes read per record type, however many people a list holds. */
function createModeLoader(ctx: SecurityContext): DataLoader<CreateKey, WriteMode, string> {
  return new DataLoader(
    async (keys) => {
      const modes = new Map<string, WriteMode>();
      for (const [recordType, group] of Map.groupBy(keys, (key) => key.recordType)) {
        const employeeIds = group.map((key) => key.employeeId);
        // A record type's permission object has its name; one without has no grants, so is refused.
        const object = recordType.toLowerCase() as PermissionObject;
        const found = await writeModes.writeModes(ctx, object, "create", employeeIds);
        for (const [employeeId, mode] of found) modes.set(keyOf({ recordType, employeeId }), mode);
      }
      return keys.map((key) => modes.get(keyOf(key))!);
    },
    { cacheKeyFn: keyOf },
  );
}

/** A person and a record type to create about them. */
type CreateKey = { recordType: string; employeeId: string };

const keyOf = ({ recordType, employeeId }: CreateKey) => `${recordType}:${employeeId}`;
