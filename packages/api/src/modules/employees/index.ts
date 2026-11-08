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
  createTermsService,
  createWorkingPatternService,
  type EmployeeInviteService,
  employeeRecordType,
  termsRecordType,
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
  createWorkingPatternService,
  createEmployeeWorkingPatternService,
  createLocationService,
  createTermsService,
  employeeDirectory,
} from "./app";
export {
  cancelPlannedVersion,
  createPersonTimeline,
  earliestChangeDate,
  employeeFieldErrors,
  makeRoomForDatedRow,
  parseChangeDate,
  parseDateField,
  parseEmployeeField,
  parseTermsSetup,
} from "./domain";

// Public types.
export type {
  EmployeeInviteService,
  EmployeeManagerService,
  EmployeePermissionService,
  EmployeeReadService,
  EmployeeService,
  EmployeeSetupService,
  ImportedEmployees,
  InviteDetails,
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
  PersonTimeline,
  TermsMembership,
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
}): ModuleManifest {
  const services = {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService(dependencies),
    ...createEmployeeManagerService(dependencies),
    ...createEmployeePermissionService(dependencies),
    ...createLocationService(dependencies),
    ...createTermsService(dependencies),
    ...createWorkingPatternService(dependencies),
  };
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services, invites),
    recordTypes: {
      employee: employeeRecordType(dependencies.orm),
      terms: termsRecordType(dependencies.orm),
    },
    jobs: invites.jobs,
    authPlugin: invitePlugin(invites, dependencies),
    router: (resolveSecurity) =>
      express
        .Router()
        .use(inviteRateLimit(mode, dependencies.logger))
        .use(avatarRouter(services, resolveSecurity)),
  };
}
