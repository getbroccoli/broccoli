import type { ApprovalService } from "../../core/approvals";
import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import type { BankHolidayService } from "../bankHolidays";
import {
  allowanceEventHandlers,
  createAllowanceService,
  createBookTimeOffService,
  createOwnTimeOffRulesService,
  createTimeOffPolicyService,
  createTimeOffRequestService,
  createWhosOutService,
  ensureAllowancesJob,
  timeOffRecordType,
  type TimeOffSetupService,
  type TimeOffService,
} from "./app";
import { createEmployeeReadService } from "../employees";
import { createResolvers } from "./graphql";

// Public values.
export {
  createAllowanceService,
  createBookTimeOffService,
  createOwnTimeOffRulesService,
  createTimeOffPolicyService,
  createTimeOffRequestService,
  createTimeOffSetupService,
  createTimeOffService,
  createWhosOutService,
  timeOffRecordType,
} from "./app";

// Public types.
export type {
  BookingPreview,
  BookTimeOffService,
  EmployeeTimeOffType,
  EnsuredAllowances,
  OwnTimeOffInput,
  OwnTimeOffMode,
  TimeOffPolicyService,
  TimeOffRequestService,
  TimeOffService,
  TurnedOnTimeOff,
} from "./app";
export type { AllowanceCause, StandardLeavePolicyKey } from "./domain";

/**
 * Time off: turning time off on, which policies terms get, booking and requesting it, and keeping
 * each person's allowances as they change and every day.
 */
export function timeOffModule({
  timeOff,
  timeOffSetup,
  bankHolidays,
  approvals,
  ...dependencies
}: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  timeOff: TimeOffService;
  timeOffSetup: TimeOffSetupService;
  bankHolidays: BankHolidayService;
  approvals: ApprovalService;
}): ModuleManifest {
  const requests = createTimeOffRequestService({
    ...dependencies,
    timeOff,
    bankHolidays,
    approvals,
  });
  return {
    name: "timeOff",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers({
      timeOff,
      timeOffSetup,
      policies: createTimeOffPolicyService({ ...dependencies, timeOff }),
      booking: createBookTimeOffService({ ...dependencies, timeOff, bankHolidays, approvals }),
      whosOut: createWhosOutService({ ...dependencies, bankHolidays }),
      ownRules: {
        ownRules: createOwnTimeOffRulesService({ ...dependencies, timeOff }),
        employees: createEmployeeReadService(dependencies),
      },
      allowances: createAllowanceService(dependencies),
      requests,
    }),
    // The decision on requested time off commits with the approval that decided it.
    eventsBeforeCommit: requests.finishApprovals,
    recordTypes: { time_off: timeOffRecordType(dependencies.orm) },
    events: {
      ...allowanceEventHandlers({ timeOff, ...dependencies }),
      // Logged once the decision commits, with identifiers only.
      "timeOff.request_decided": (decided) =>
        Promise.resolve(dependencies.logger.info(decided, "Decided time off request")),
      "timeOff.time_off_turned_on": (turnedOn) =>
        Promise.resolve(dependencies.logger.info(turnedOn, "Turned time off on")),
    },
    jobs: ensureAllowancesJob({ timeOff, ...dependencies }),
  };
}
