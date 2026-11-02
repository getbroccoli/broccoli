import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import express from "express";

import type { Mode } from "../../core/env";
import {
  createEmployeeManagerService,
  createEmployeePermissionService,
  createEmployeeReadService,
  createEmployeeService,
  createLocationService,
  type EmployeeInviteService,
  employeeRecordType,
  type EmploymentChanges,
} from "./app";
import { invitePlugin } from "./betterAuth";
import { createResolvers } from "./graphql";
import { avatarRouter, inviteRateLimit } from "./http";

// Public values.
export {
  createEmployeeInviteService,
  createEmployeeManagerService,
  createEmployeePermissionService,
  createEmployeeReadService,
  createEmployeeService,
  createEmployeeSetupService,
  createGroupWorkingPatternService,
  createWorkingPatternService,
  createEmployeeWorkingPatternService,
  createLocationService,
  employeeDirectory,
  noEmploymentChanges,
} from "./app";
export { employeeFieldErrors, parseEmployeeField } from "./domain";

// Public types.
export type {
  EmploymentChangeCause,
  EmploymentChanges,
  EmployeeInviteService,
  EmployeeManagerService,
  EmployeePermissionService,
  EmployeeReadService,
  EmployeeService,
  EmployeeSetupService,
  ImportedEmployees,
  InviteDetails,
  GroupWorkingPatternService,
  WorkingPatternService,
  EmployeeWorkingPatternService,
  LocationService,
} from "./app";
export type {
  Employee,
  EmployeeOrder,
  EmployeeOrderField,
  NewEmployee,
  NewEmployeeInput,
  WeekdayMinutes,
  WorkingWeek,
} from "./domain";

/**
 * The people who work for the company: create, change, remove and list them, keep their history,
 * serve their avatars, and invite them to sign in.
 */
export function employeesModule({
  mode,
  invites,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  mode: Mode;
  /** Built by startup, which setup's last step shares. */
  invites: EmployeeInviteService;
  employmentChanges: EmploymentChanges;
}): ModuleManifest {
  const services = {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService(dependencies),
    ...createEmployeeManagerService(dependencies),
    ...createEmployeePermissionService(dependencies),
    ...createLocationService(dependencies),
  };
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services, invites),
    recordTypes: { employee: employeeRecordType(dependencies.orm) },
    jobs: invites.jobs,
    authPlugin: invitePlugin(invites, dependencies),
    router: (resolveSecurity) =>
      express
        .Router()
        .use(inviteRateLimit(mode, dependencies.logger))
        .use(avatarRouter(services, resolveSecurity)),
  };
}
