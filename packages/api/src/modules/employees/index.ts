import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import express from "express";

import type { Mode } from "../../core/env";
import {
  type CopyTermsParts,
  type LockTermsParts,
  createEmployeeManagerService,
  createEmployeePermissionService,
  createEmployeeReadService,
  createEmployeeService,
  createEmployeeWorkingPatternService,
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
  termsRecordType,
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
  personVersionsFrom,
  versionsFromToday,
} from "./domain";

// Public types.
export type {
  CopyTermsParts,
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
  PersonVersion,
  TermsMembership,
  TermsSetup,
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
  copyTermsParts,
  lockTermsParts,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  mode: Mode;
  /** Built by startup, which setup's last step shares. */
  invites: EmployeeInviteService;
  /** Copies what other modules keep on terms, such as time off rules, onto cloned terms. */
  copyTermsParts: CopyTermsParts;
  /** Locks what other modules keep on terms, such as time off rules, before a terms' row. */
  lockTermsParts: LockTermsParts;
}): ModuleManifest {
  const services = {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService(dependencies),
    ...createEmployeeManagerService(dependencies),
    ...createEmployeePermissionService(dependencies),
    ...createLocationService(dependencies),
    ...createTermsService({ ...dependencies, copyTermsParts, lockTermsParts }),
    ...createWorkingPatternService(dependencies),
    ...createEmployeeWorkingPatternService(dependencies),
  };
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services, invites),
    recordTypes: {
      employee: employeeRecordType(dependencies.orm),
      terms: { ...termsRecordType(dependencies.orm), clone: services.cloneTerms },
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
