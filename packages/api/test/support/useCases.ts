import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onTestFinished } from "vitest";

import type { Decisions } from "../../src/integrations/ai";
import type { Orm, Transact } from "../../src/core/db";
import type { Mode } from "../../src/core/env";
import {
  type AiSettings,
  createAiSettings,
  type OriginalFileReader,
} from "../../src/core/instance";
import type { JobQueue, JobName, Jobs } from "../../src/core/jobs";
import { createLogger, type Logger } from "../../src/core/logger";
import type { SecretBox } from "../../src/core/secrets";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import type { SlackApi, SlackAuthorization } from "../../src/integrations/slack";
import { createCompanyUseCases } from "../../src/modules/company";
import { createDemoUseCases, prepareDemoFill } from "../../src/modules/demo";
import { createEmployeeUseCases, deleteAllEmployees } from "../../src/modules/employees";
import { createImportUseCases } from "../../src/modules/imports";
import { createExternalAgentUseCases } from "../../src/modules/externalAgents";
import { createSystemUseCases } from "../../src/modules/system";
import { parseCalendarDate } from "../../src/utils";
import { createSlackConnectionService } from "../../src/modules/slack";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { testTransactor } from "./testTransactor";

/**
 * The company use cases on `orm` with test defaults: no brand is found and logs are
 * silent. A test passes only the dependency it is about.
 */
export function companyUseCases(
  orm: Parameters<typeof createCompanyUseCases>[0]["orm"],
  {
    brandLookup = () => Promise.resolve(null),
    logger = createLogger("silent"),
  }: { brandLookup?: BrandLookup; logger?: Logger } = {},
) {
  return createCompanyUseCases({ orm, transact: testTransactor(orm), logger, brandLookup });
}

export function employeeUseCases(
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
) {
  return createEmployeeUseCases({ orm, transact, logger: createLogger("silent") });
}

export function demoUseCases(orm: Parameters<typeof createDemoUseCases>[0]["orm"]) {
  return createDemoUseCases({ orm, transact: testTransactor(orm) });
}

export function systemUseCases(orm: Orm) {
  return createSystemUseCases({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    mode: "self_hosted",
    addApprovedPeople: importUseCases(orm).addApprovedPeople,
    deleteAllEmployees,
    deleteFinishedImport: importUseCases(orm).deleteFinishedImport,
    aiSettings: aiSettings(orm),
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
): AiSettings {
  const dataDir = mkdtempSync(join(tmpdir(), "broccoli-data-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  return createAiSettings({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    dataDir,
    deployment:
      mode === "managed"
        ? { mode, instanceId: "test-instance", accountsOrigin: "https://accounts.example.com" }
        : { mode },
    broccoliAiUrl: url,
    openRouter: { url, key: environmentKey },
  });
}

export function importUseCases(
  orm: Parameters<typeof createImportUseCases>[0]["orm"],
  {
    slackApi = {},
    decisions = NO_DECISIONS,
    originalFileReader = NO_ORIGINAL_FILE_READER,
    jobs,
    clock = () => new Date(),
    prepareDemoFill: prepareFill = () => prepareDemoFill(DEMO_TODAY),
  }: {
    slackApi?: Partial<SlackApi>;
    decisions?: Decisions;
    originalFileReader?: Pick<OriginalFileReader, "readOriginalFile">;
    jobs?: JobQueue;
    clock?: () => Date;
    prepareDemoFill?: Parameters<typeof createImportUseCases>[0]["prepareDemoFill"];
  } = {},
) {
  const sentJobs: { name: JobName; payload: Jobs[JobName] }[] = [];
  const useCases = createImportUseCases({
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
    slack: slackUseCases(orm, { slackApi, clock }),
  });
  return { ...useCases, sentJobs };
}

export function slackUseCases(
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

export function externalAgentUseCases(
  orm: Parameters<typeof createExternalAgentUseCases>[0]["orm"],
  { clock = () => new Date("2026-10-20T12:00:00Z") }: { clock?: () => Date } = {},
) {
  const imports = importUseCases(orm);
  const useCases = createExternalAgentUseCases({
    orm,
    transact: testTransactor(orm),
    imports,
    clock,
  });
  return { ...useCases, sentJobs: imports.sentJobs };
}

/** The default model of use-case tests: one that is never asked. */
const NO_DECISIONS: Decisions = {
  decide: () => Promise.reject(new Error("Unexpected model request")),
};

const DEMO_TODAY = parseCalendarDate("2026-10-13")!;

const NO_ORIGINAL_FILE_READER: Pick<OriginalFileReader, "readOriginalFile"> = {
  readOriginalFile: () => Promise.reject(new Error("Unexpected model request")),
};
