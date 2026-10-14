import { createEventBus } from "../../src/core/events";
import { createLogger, type Logger } from "../../src/core/logger";
import type { Encryption } from "../../src/core/secrets";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import type { SlackApi, SlackAuthorization } from "../../src/integrations/slack";
import { createCompanyUseCases } from "../../src/modules/company";
import { createDemoUseCases } from "../../src/modules/demo";
import { createImportUseCases } from "../../src/modules/imports";
import { createSlackConnectionService, type SlackConnectionService } from "../../src/modules/slack";
import { TEST_ENCRYPTION } from "./testEncryption";

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
  return createCompanyUseCases({ orm, eventBus: createEventBus(logger), logger, brandLookup });
}

export function demoUseCases(orm: Parameters<typeof createDemoUseCases>[0]["orm"]) {
  const logger = createLogger("silent");
  return createDemoUseCases({ orm, eventBus: createEventBus(logger) });
}

export function importUseCases(
  orm: Parameters<typeof createImportUseCases>[0]["orm"],
  {
    slack = {},
  }: {
    slack?: Partial<Pick<SlackConnectionService, "readSlackMembers" | "isCurrentSlackConnection">>;
  } = {},
) {
  const logger = createLogger("silent");
  return createImportUseCases({
    orm,
    eventBus: createEventBus(logger),
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
}

export function slackUseCases(
  orm: Parameters<typeof createSlackConnectionService>[0]["orm"],
  {
    encryption = TEST_ENCRYPTION,
    slackAuthorization = {},
    slackApi = {},
  }: {
    slackAuthorization?: Partial<SlackAuthorization>;
    slackApi?: Partial<SlackApi>;
    encryption?: Encryption;
  } = {},
) {
  const logger = createLogger("silent");
  return createSlackConnectionService({
    orm,
    eventBus: createEventBus(logger),
    logger,
    encryption,
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
