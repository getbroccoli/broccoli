import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onTestFinished } from "vitest";

import type { Decisions } from "../../src/integrations/ai";
import type { Orm, Transact } from "../../src/core/db";
import type { Mode } from "../../src/core/env";
import {
  type AiSettingsService,
  createAiSettingsService,
  createMailSettingsService,
  createPasswordResetEmailService,
  type MailSettingsService,
  type OriginalFileReader,
} from "../../src/core/instance";
import type { JobQueue, JobName, Jobs } from "../../src/core/jobs";
import { createLogger, type Logger } from "../../src/core/logger";
import type { SecretBox } from "../../src/core/secrets";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import type { SlackApi, SlackAuthorization } from "../../src/integrations/slack";
import { createCompanyService } from "../../src/modules/company";
import { createDemoService } from "../../src/modules/demo";
import {
  createEmployeeInviteService,
  createEmployeeManagerService,
  createEmployeePermissionService,
  createEmployeeReadService,
  createEmployeeService,
  type EmployeeManagerService,
  type EmployeePermissionService,
  type EmployeeReadService,
  type EmployeeService,
} from "../../src/modules/employees";
import { createImportServices } from "../../src/modules/imports";
import { createExternalAgentServices } from "../../src/modules/externalAgents";
import { createSystemService } from "../../src/modules/system";
import { parseCalendarDate } from "../../src/utils";
import { createSlackConnectionService } from "../../src/modules/slack";
import { fakeMail } from "./fakeMail";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { demoFill, employeeSetup } from "./statelessServices";
import { testTransactor } from "./testTransactor";

/**
 * The company service on `orm` with test defaults: no brand is found and logs are
 * silent. A test passes only the dependency it is about.
 */
export function companyService(
  orm: Parameters<typeof createCompanyService>[0]["orm"],
  {
    brandLookup = () => Promise.resolve(null),
    logger = createLogger("silent"),
  }: { brandLookup?: BrandLookup; logger?: Logger } = {},
) {
  return createCompanyService({ orm, transact: testTransactor(orm), logger, brandLookup });
}

/** Every employee service a person's actions reach, together. */
export type EmployeeServices = EmployeeService &
  EmployeeReadService &
  EmployeeManagerService &
  EmployeePermissionService;

/** Every employee service on `orm`, with silent logs. */
export function employeeServices(
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
): EmployeeServices {
  const dependencies = { orm, transact, logger: createLogger("silent") };
  return {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService(dependencies),
    ...createEmployeeManagerService(dependencies),
    ...createEmployeePermissionService(dependencies),
  };
}

export function demoService(orm: Parameters<typeof createDemoService>[0]["orm"]) {
  return createDemoService({ orm, transact: testTransactor(orm) });
}

export function systemService(orm: Orm) {
  return createSystemService({
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    addApprovedPeople: importServices(orm).addApprovedPeople,
    deleteAllEmployees: employeeSetup.deleteAllEmployees,
    deleteFinishedImport: importServices(orm).deleteFinishedImport,
  });
}

/** The AI settings on `orm` with a temporary data folder; OpenRouter and Broccoli AI both at `url`. */
export function aiSettings(
  orm: Orm,
  {
    mode = "self_hosted",
    url = "http://127.0.0.1:9",
    environmentKey = null,
  }: { mode?: Mode; url?: string; environmentKey?: string | null } = {},
): AiSettingsService {
  const dataDir = mkdtempSync(join(tmpdir(), "broccoli-data-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  return createAiSettingsService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    dataDir,
    deployment:
      mode === "managed"
        ? {
            mode,
            instanceId: "test-instance",
            accountsOrigin: "https://accounts.example.com",
            mailRelayUrl: "http://127.0.0.1:9",
          }
        : { mode },
    broccoliAiUrl: url,
    openRouter: { url, key: environmentKey },
  });
}

export function mailSettings(
  orm: Orm,
  {
    mode = "self_hosted",
    publicUrl,
    mailRelayUrl = "http://127.0.0.1:9",
    mail = fakeMail(),
  }: {
    mode?: Mode;
    publicUrl?: string;
    mailRelayUrl?: string;
    mail?: Parameters<typeof createMailSettingsService>[0]["mail"];
  } = {},
): MailSettingsService {
  return createMailSettingsService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    deployment:
      mode === "managed"
        ? {
            mode,
            instanceId: "test-instance",
            accountsOrigin: "https://accounts.example.com",
            mailRelayUrl,
          }
        : { mode, publicUrl },
    logger: createLogger("silent"),
    resendApiUrl: "http://127.0.0.1:9",
    mail,
  });
}

export function passwordResetEmail(
  orm: Orm,
  options: NonNullable<Parameters<typeof mailSettings>[1]>,
) {
  const sentJobs: {
    name: "instance.sendPasswordResetEmail";
    payload: Jobs["instance.sendPasswordResetEmail"];
  }[] = [];
  const service = createPasswordResetEmailService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    mailSettings: mailSettings(orm, options),
    logger: createLogger("silent"),
    jobs: {
      send: (_tx, name, payload) => {
        assert.equal(name, "instance.sendPasswordResetEmail");
        assert("userId" in payload && "encryptedToken" in payload);
        sentJobs.push({ name: "instance.sendPasswordResetEmail", payload });
        return Promise.resolve();
      },
    },
  });
  return { ...service, sentJobs };
}

export function employeeInviteService(
  orm: Orm,
  options: NonNullable<Parameters<typeof mailSettings>[1]> = {},
) {
  const sentJobs: { name: "employees.sendInvite"; payload: Jobs["employees.sendInvite"] }[] = [];
  const service = createEmployeeInviteService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    mailSettings: mailSettings(orm, options),
    readCompany: companyService(orm).readStoredCompany,
    logger: createLogger("silent"),
    jobs: {
      send: (_tx, name, payload) => {
        assert.equal(name, "employees.sendInvite");
        assert("inviteId" in payload && "encryptedToken" in payload);
        sentJobs.push({ name: "employees.sendInvite", payload });
        return Promise.resolve();
      },
    },
  });
  return { ...service, sentJobs };
}

export function importServices(
  orm: Parameters<typeof createImportServices>[0]["orm"],
  {
    slackApi = {},
    decisions = NO_DECISIONS,
    originalFileReader = NO_ORIGINAL_FILE_READER,
    jobs,
    clock = () => new Date(),
    prepareDemoFill: prepareFill = () => demoFill.prepareDemoFill(DEMO_TODAY),
  }: {
    slackApi?: Partial<SlackApi>;
    decisions?: Decisions;
    originalFileReader?: Pick<OriginalFileReader, "readOriginalFile">;
    jobs?: JobQueue;
    clock?: () => Date;
    prepareDemoFill?: Parameters<typeof createImportServices>[0]["prepareDemoFill"];
  } = {},
) {
  const sentJobs: { name: JobName; payload: Jobs[JobName] }[] = [];
  const services = createImportServices({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    decisions,
    originalFileReader: { ...aiSettings(orm).originalFileReader, ...originalFileReader },
    prepareDemoFill: prepareFill,
    jobs: jobs ?? {
      send: (_tx, name, payload) => {
        sentJobs.push({ name, payload });
        return Promise.resolve();
      },
    },
    slack: slackServices(orm, { slackApi, clock }),
  });
  return { ...services, sentJobs };
}

export function slackServices(
  orm: Parameters<typeof createSlackConnectionService>[0]["orm"],
  {
    secretBox = TEST_SECRET_BOX,
    slackAuthorization = {},
    slackApi = {},
    clock = () => new Date(),
  }: {
    slackAuthorization?: Partial<SlackAuthorization>;
    slackApi?: Partial<SlackApi>;
    secretBox?: SecretBox;
    clock?: () => Date;
  } = {},
) {
  const logger = createLogger("silent");
  return createSlackConnectionService({
    orm,
    transact: testTransactor(orm),
    logger,
    secretBox,
    clock,
    slackAuthorization: {
      authorizeUrl: ({ returnTo, state, codeChallenge }) => {
        const url = new URL("https://example.com/slack/authorize");
        url.search = new URLSearchParams({
          return_to: returnTo,
          state,
          code_challenge: codeChallenge,
        }).toString();
        return url;
      },
      exchange: () => {
        throw new Error("Unexpected Slack exchange");
      },
      ...slackAuthorization,
    },
    slackApi: {
      listMembers: () => {
        throw new Error("Unexpected Slack read");
      },
      readPhoto: () => {
        throw new Error("Unexpected Slack photo download");
      },
      ...slackApi,
    },
  });
}

export function externalAgentServices(
  orm: Parameters<typeof createExternalAgentServices>[0]["orm"],
  { clock = () => new Date("2026-10-20T12:00:00Z") }: { clock?: () => Date } = {},
) {
  const imports = importServices(orm);
  const services = createExternalAgentServices({
    orm,
    transact: testTransactor(orm),
    imports,
    clock,
  });
  return { ...services, sentJobs: imports.sentJobs };
}

/** The default model of use-case tests: one that is never asked. */
const NO_DECISIONS: Decisions = {
  decide: () => Promise.reject(new Error("Unexpected model request")),
};

const DEMO_TODAY = parseCalendarDate("2026-10-13")!;

const NO_ORIGINAL_FILE_READER: Pick<OriginalFileReader, "readOriginalFile"> = {
  readOriginalFile: () => Promise.reject(new Error("Unexpected model request")),
};
