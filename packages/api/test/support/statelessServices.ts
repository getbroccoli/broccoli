import { createFileStorageService } from "../../src/core/files";
import {
  createInstanceService,
  createManagedInstanceService,
  createOwnerService,
  createSetupSessionService,
  createSetupStepService,
} from "../../src/core/instance";
import { createRecordHistoryService } from "../../src/core/records";
import { createEmployeeSetupService } from "../../src/modules/employees";

/** Services without dependencies, built once for every test. */
export const instances = createInstanceService();
export const owners = createOwnerService();
export const setupSteps = createSetupStepService();
export const setupSessions = createSetupSessionService();
export const managedInstance = createManagedInstanceService();
export const fileStorage = createFileStorageService();
export const recordHistory = createRecordHistoryService();
export const employeeSetup = createEmployeeSetupService();
