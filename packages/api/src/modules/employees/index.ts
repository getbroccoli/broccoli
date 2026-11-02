import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import express from "express";

import type { Mode } from "../../core/env";
import type { MailSettingsService } from "../../core/instance";
import type { SecurityContext } from "../../core/security";
import {
  createEmployeeInviteService,
  createEmployeeManagerService,
  createEmployeePermissionService,
  createEmployeeReadService,
  createEmployeeService,
  employeeRecordType,
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
  employeeDirectory,
} from "./app";
export { employeeFieldErrors, parseEmployeeField } from "./domain";

// Public types.
export type {
  EmployeeInviteService,
  EmployeeManagerService,
  EmployeePermissionService,
  EmployeeReadService,
  EmployeeService,
  ImportedEmployees,
  InviteDetails,
} from "./app";
export type {
  Employee,
  EmployeeOrder,
  EmployeeOrderField,
  NewEmployee,
  NewEmployeeInput,
} from "./domain";

/**
 * The people who work for the company: create, change, remove and list them, keep their history,
 * serve their avatars, and invite them to sign in.
 */
export function employeesModule({
  mode,
  mailSettings,
  readCompany,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger" | "jobs" | "secretBox"> & {
  mode: Mode;
  mailSettings: MailSettingsService;
  readCompany: (ctx: SecurityContext) => Promise<{ name: string | null }>;
}): ModuleManifest {
  const services = {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService(dependencies),
    ...createEmployeeManagerService(dependencies),
    ...createEmployeePermissionService(dependencies),
  };
  const invites = createEmployeeInviteService({ ...dependencies, mailSettings, readCompany });
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
