import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import express from "express";

import type { Mode } from "../../core/env";
import type { MailSettings } from "../../core/instance";
import { createEmployeeInviteService, createEmployeeUseCases, employeeRecordType } from "./app";
import { invitePlugin } from "./betterAuth";
import { createResolvers } from "./graphql";
import { avatarRouter, inviteRateLimit } from "./http";

// Public values.
export {
  createDemoEmployees,
  createEmployeeInviteService,
  createEmployeeUseCases,
  createImportedEmployees,
  deleteAllEmployees,
  employeeDirectory,
  findEmployeesWithAvatars,
  findTakenEmails,
  hasDemoEmployees,
} from "./app";
export { employeeFieldErrors, parseEmployeeField } from "./domain";

// Public types.
export type { EmployeeInviteService, ImportedEmployees, InviteDetails } from "./app";
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
  readCompanyName,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger" | "jobs" | "secretBox"> & {
  mode: Mode;
  mailSettings: MailSettings;
  readCompanyName: () => Promise<string>;
}): ModuleManifest {
  const useCases = createEmployeeUseCases(dependencies);
  const invites = createEmployeeInviteService({ ...dependencies, mailSettings, readCompanyName });
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases, invites),
    recordTypes: { employee: employeeRecordType(dependencies.orm) },
    jobs: invites.jobs,
    authPlugin: invitePlugin(invites, dependencies),
    router: (resolveSecurity) =>
      express.Router().use(inviteRateLimit(mode)).use(avatarRouter(useCases, resolveSecurity)),
  };
}
