import type { Decisions } from "../../src/integrations/ai";
import type { JobQueue, JobName, Jobs } from "../../src/core/jobs";
import { createLogger, type Logger } from "../../src/core/logger";
import type { SecretBox } from "../../src/core/secrets";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import type { SlackApi, SlackAuthorization } from "../../src/integrations/slack";
import { createCompanyUseCases } from "../../src/modules/company";
import { createDemoUseCases } from "../../src/modules/demo";
import { createImportUseCases } from "../../src/modules/imports";
import { createSlackConnectionService, type SlackConnectionService } from "../../src/modules/slack";
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

export function importUseCases(
  orm: Parameters<typeof createImportUseCases>[0]["orm"],
  {
    slack = {},
    decisions = NO_DECISIONS,
    jobs,
  }: {
    slack?: Partial<Pick<SlackConnectionService, "readSlackMembers" | "isCurrentSlackConnection">>;
    decisions?: Decisions;
    jobs?: JobQueue;
  } = {},
) {
  const sentJobs: { name: JobName; payload: Jobs[JobName] }[] = [];
  const useCases = createImportUseCases({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    decisions,
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
      ...slackApi,
    },
  });
}

/** The default model of use-case tests: one that is never asked. */
const NO_DECISIONS: Decisions = {
  decide: () => Promise.reject(new Error("Unexpected model request")),
};
