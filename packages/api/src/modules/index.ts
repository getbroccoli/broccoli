import {
  createAiSettingsService,
  createMailSettingsService,
  createPasswordResetEmailService,
} from "../core/instance";
import type { Deployment } from "../core/env";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import { createBankHolidayService, createStaticBankHolidaySource } from "./bankHolidays";
import { companyModule, createCompany } from "./company";
import { createDemoFillService, demoModule } from "./demo";
import {
  createEmployeeInviteService,
  createEmployeeReadService,
  createEmployeeSetupService,
  employeeDirectory,
  employeesModule,
} from "./employees";
import { externalAgentsModule } from "./externalAgents";
import { createImportServices, importsModule } from "./imports";
import { createSlack, slackModule, type SlackUrls } from "./slack";
import { systemModule } from "./system";
import { allowancesOnEmploymentChanges, createTimeOffService, timeOffModule } from "./timeOff";

const employeeSetup = createEmployeeSetupService();

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  deployment: Deployment;
  brandLookupUrl: string | null;
  slack: SlackUrls;
  /** OpenRouter's API, and `OPENROUTER_API_KEY` or null. */
  openRouter: { url: string; key: string | null };
  broccoliAiUrl: string;
  /** Resend's API, for an owner who chose to send email with their Resend key. */
  resendApiUrl: string;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { deployment, brandLookupUrl, slack, openRouter, broccoliAiUrl, resendApiUrl }: ModuleSettings,
): Modules {
  // Built once: the Slack module serves it and the import reads Slack through it.
  const slackConnection = createSlack({ ...core, slack });
  const aiSettings = createAiSettingsService({ ...core, deployment, openRouter, broccoliAiUrl });
  const mailSettings = createMailSettingsService({ ...core, deployment, resendApiUrl });
  const passwordResetEmail = createPasswordResetEmailService({ ...core, mailSettings });
  const company = createCompany({ ...core, brandLookupUrl });
  const timeOff = createTimeOffService({
    ...core,
    bankHolidays: createBankHolidayService({ bankHolidaySource: createStaticBankHolidaySource() }),
  });
  // Every path that clears the people unlinks the groups' time off policies too, back to a fresh workspace.
  const deleteAllEmployees: typeof employeeSetup.deleteAllEmployees = async (ctx, tx) => {
    // Links first: linking holds their lock while its allowances wait on employee rows.
    await timeOff.deleteAllGroupPolicies(ctx, tx);
    await employeeSetup.deleteAllEmployees(ctx, tx);
  };
  // People added or given a new start date get their allowances in the same transaction.
  const employmentChanges = allowancesOnEmploymentChanges(timeOff);
  // Built once: the employees module serves it and setup's last step invites through it.
  const invites = createEmployeeInviteService({
    ...core,
    mailSettings,
    readCompany: company.readStoredCompany,
  });
  // Built once: the import serves them and the external agent puts its files through them.
  const importServices = createImportServices({
    ...core,
    slack: slackConnection,
    decisions: aiSettings.decisions,
    originalFileReader: aiSettings.originalFileReader,
    prepareDemoFill: createDemoFillService({
      employmentChanges,
      timeOff,
      employeeReads: createEmployeeReadService(core),
    }).prepareDemoFill,
    invites,
    deleteAllEmployees,
    employmentChanges,
  });
  const manifests = [
    systemModule({
      ...core,
      mode: deployment.mode,
      aiSettings,
      mailSettings,
      passwordResetEmail,
      addApprovedPeople: importServices.addApprovedPeople,
      deleteAllEmployees,
      deleteFinishedImport: importServices.deleteFinishedImport,
    }),
    employeesModule({ ...core, mode: deployment.mode, invites, employmentChanges }),
    companyModule(company),
    demoModule({ orm: core.orm, transact: core.transact, deleteAllEmployees }),
    slackModule(slackConnection),
    importsModule(importServices),
    externalAgentsModule({ ...core, mode: deployment.mode, imports: importServices }),
    timeOffModule({ ...core, timeOff }),
  ];
  return {
    manifests: [...manifests, recordsManifest(core.orm, manifests)],
    setupDemo: {
      prepareStart: importServices.prepareDemoStart,
      deleteAllEmployees,
    },
    addApprovedPeople: importServices.addApprovedPeople,
    employeeDirectory: employeeDirectory(core.orm),
    passwordResetEmail,
  };
}
