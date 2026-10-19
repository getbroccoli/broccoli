import type { Decisions } from "../../src/integrations/ai";
import type { Mode } from "../../src/core/env";
import type { JobQueue, JobName, Jobs } from "../../src/core/jobs";
import { createLogger, type Logger } from "../../src/core/logger";
import type { SecretBox } from "../../src/core/secrets";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import type { SlackApi, SlackAuthorization } from "../../src/integrations/slack";
import { createCompanyUseCases } from "../../src/modules/company";
import { createDemoUseCases, prepareDemoFill } from "../../src/modules/demo";
import { createImportUseCases } from "../../src/modules/imports";
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

export function demoUseCases(orm: Parameters<typeof createDemoUseCases>[0]["orm"]) {
  return createDemoUseCases({ orm, transact: testTransactor(orm) });
}

export function systemUseCases(
  orm: Parameters<typeof createSystemUseCases>[0]["orm"],
  {
    mode = "self_hosted",
    environmentKey = null,
    checkOpenRouterKey = () => {
      throw new Error("Unexpected OpenRouter key check");
    },
    prepareBroccoliAi = () => {
      throw new Error("Unexpected Broccoli AI preparation");
    },
  }: {
    mode?: Mode;
    environmentKey?: string | null;
    checkOpenRouterKey?: (key: string) => Promise<void>;
    prepareBroccoliAi?: () => Promise<void>;
  } = {},
) {
  return createSystemUseCases({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    mode,
    ai: { environmentKey, checkOpenRouterKey, prepareBroccoliAi },
  });
}

export function importUseCases(
  orm: Parameters<typeof createImportUseCases>[0]["orm"],
  {
    slack = {},
    decisions = NO_DECISIONS,
    jobs,
    prepareDemoFill: prepareFill = () => prepareDemoFill(DEMO_TODAY),
  }: {
    slack?: Partial<Parameters<typeof createImportUseCases>[0]["slack"]>;
    decisions?: Decisions;
    jobs?: JobQueue;
    prepareDemoFill?: Parameters<typeof createImportUseCases>[0]["prepareDemoFill"];
  } = {},
) {
  const sentJobs: { name: JobName; payload: Jobs[JobName] }[] = [];
  const useCases = createImportUseCases({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    decisions,
    prepareDemoFill: prepareFill,
    jobs: jobs ?? {
      send: (_tx, name, payload) => {
        sentJobs.push({ name, payload });
        return Promise.resolve();
      },
    },
    slack: {
      readSlackMembers: () => {
        throw new Error("Unexpected Slack read");
      },
      isCurrentSlackConnection: () => {
        throw new Error("Unexpected Slack connection check");
      },
      readSlackPhoto: () => {
        throw new Error("Unexpected Slack photo download");
      },
      ...slack,
    },
  });
  return { ...useCases, sentJobs };
}

export function slackUseCases(
  orm: Parameters<typeof createSlackConnectionService>[0]["orm"],
  {
    secretBox = TEST_SECRET_BOX,
    slackAuthorization = {},
    slackApi = {},
  }: {
    slackAuthorization?: Partial<SlackAuthorization>;
    slackApi?: Partial<SlackApi>;
    secretBox?: SecretBox;
  } = {},
) {
  const logger = createLogger("silent");
  return createSlackConnectionService({
    orm,
    transact: testTransactor(orm),
    logger,
    secretBox,
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

/** The default model of use-case tests: one that is never asked. */
const NO_DECISIONS: Decisions = {
  decide: () => Promise.reject(new Error("Unexpected model request")),
};

const DEMO_TODAY = parseCalendarDate("2026-10-13")!;
