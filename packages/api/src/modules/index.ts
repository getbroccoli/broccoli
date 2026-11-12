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
import { mcpAgentsModule } from "./mcpAgents";
import { createProcessService, processesModule } from "./processes";
import { createSlack, slackModule, type SlackUrls } from "./slack";
import { systemModule } from "./system";
import { createTaskService, tasksModule } from "./tasks";
import { createTimeOffSetupService, createTimeOffService, timeOffModule } from "./timeOff";

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
// eslint-disable-next-line broccoli/max-lines-per-function -- the composition root: one line per module's wiring.
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
  const bankHolidays = createBankHolidayService({
    bankHolidaySource: createStaticBankHolidaySource(),
  });
  const timeOff = createTimeOffService({ ...core, bankHolidays });
  const tasks = createTaskService(core);
  const processes = createProcessService({ ...core, tasks, bankHolidays });
  // Every path that clears the people resets time off, processes and tasks too, back to a fresh workspace.
  const deleteAllEmployees: typeof employeeSetup.deleteAllEmployees = async (ctx, tx) => {
    // The policies' lock first: turning time off on holds it while its allowances wait on employee rows.
    await timeOff.lockPolicies(ctx, tx);
    // Then the processes: a step command locks its process before its run and task.
    await processes.lockProcesses(ctx, tx);
    // Then the tasks: a task change can create tasks for employees before it commits.
    await tasks.lockTasks(ctx, tx);
    // Employees next: their assignments, allowances and ledger lines point at the policies.
    await employeeSetup.deleteAllEmployees(ctx, tx);
    await timeOff.resetTimeOff(ctx, tx);
    await processes.resetProcesses(ctx, tx);
    await tasks.resetTasks(ctx, tx);
  };
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
    prepareDemoFill: createDemoFillService({ timeOff, tasks }).prepareDemoFill,
    invites,
    turnOnTimeOff: timeOff.turnOnTimeOff,
    deleteAllEmployees,
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
    employeesModule({
      ...core,
      mode: deployment.mode,
      invites,
      copyTermsParts: timeOff.copyTermsPolicies,
      lockTermsParts: timeOff.lockPolicies,
    }),
    companyModule(company),
    demoModule({ orm: core.orm, transact: core.transact, deleteAllEmployees }),
    slackModule(slackConnection),
    importsModule(importServices),
    externalAgentsModule({ ...core, mode: deployment.mode, imports: importServices }),
    mcpAgentsModule(core),
    timeOffModule({
      ...core,
      timeOff,
      bankHolidays,
      timeOffSetup: createTimeOffSetupService({
        ...core,
        decisions: aiSettings.decisions,
        bankHolidays,
      }),
    }),
    tasksModule({ orm: core.orm, tasks, employees: createEmployeeReadService(core) }),
    processesModule({ logger: core.logger, processes }),
  ];
  return {
    manifests: [...manifests, recordsManifest(core, manifests)],
    setupDemo: {
      prepareStart: importServices.prepareDemoStart,
      deleteAllEmployees,
    },
    addApprovedPeople: importServices.addApprovedPeople,
    employeeDirectory: employeeDirectory(core.orm),
    passwordResetEmail,
  };
}
