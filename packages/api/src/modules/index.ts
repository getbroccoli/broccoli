import { createAiSettings, createMailSettings, createPasswordResetEmail } from "../core/instance";
import type { Deployment } from "../core/env";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import { companyModule, readStoredCompany } from "./company";
import { demoModule, prepareDemoFill } from "./demo";
import { deleteAllEmployees, employeeDirectory, employeesModule } from "./employees";
import { externalAgentsModule } from "./externalAgents";
import { createImportUseCases, importsModule } from "./imports";
import { createSlack, slackModule, type SlackUrls } from "./slack";
import { systemModule } from "./system";

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
  const aiSettings = createAiSettings({ ...core, deployment, openRouter, broccoliAiUrl });
  const mailSettings = createMailSettings({ ...core, deployment, resendApiUrl });
  const passwordResetEmail = createPasswordResetEmail({ ...core, mailSettings });
  // Built once: the import serves them and the external agent puts its files through them.
  const importUseCases = createImportUseCases({
    ...core,
    slack: slackConnection,
    decisions: aiSettings.decisions,
    originalFileReader: aiSettings.originalFileReader,
    prepareDemoFill,
  });
  const manifests = [
    systemModule({
      ...core,
      mode: deployment.mode,
      aiSettings,
      mailSettings,
      passwordResetEmail,
      addApprovedPeople: importUseCases.addApprovedPeople,
      deleteAllEmployees,
      deleteFinishedImport: importUseCases.deleteFinishedImport,
    }),
    employeesModule({
      ...core,
      mode: deployment.mode,
      mailSettings,
      readCompany: (ctx) => readStoredCompany(ctx, core.orm),
    }),
    companyModule({ ...core, brandLookupUrl }),
    demoModule({ orm: core.orm, transact: core.transact }),
    slackModule(slackConnection),
    importsModule(importUseCases),
    externalAgentsModule({ ...core, mode: deployment.mode, imports: importUseCases }),
  ];
  return {
    manifests: [...manifests, recordsManifest(core.orm, manifests)],
    setupDemo: {
      prepareStart: importUseCases.prepareDemoStart,
      deleteAllEmployees,
    },
    addApprovedPeople: importUseCases.addApprovedPeople,
    employeeDirectory: employeeDirectory(core.orm),
    passwordResetEmail,
  };
}
