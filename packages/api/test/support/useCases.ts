import { createEventBus } from "../../src/core/events";
import { createLogger, type Logger } from "../../src/core/logger";
import type { SecretBox } from "../../src/core/secrets";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import type { SlackClient } from "../../src/integrations/slack";
import { createCompanyUseCases } from "../../src/modules/company";
import { createDemoUseCases } from "../../src/modules/demo";
import { createImportUseCases } from "../../src/modules/imports";
import { TEST_SECRET_BOX } from "./testSecretBox";

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
    secretBox = TEST_SECRET_BOX,
    slack = {},
  }: { slack?: Partial<SlackClient>; secretBox?: SecretBox } = {},
) {
  const logger = createLogger("silent");
  return createImportUseCases({
    orm,
    eventBus: createEventBus(logger),
    logger,
    secretBox,
    slack: {
      authorizeUrl: () => {
        throw new Error("Unexpected Slack authorization");
      },
      redeem: () => {
        throw new Error("Unexpected Slack redemption");
      },
      listMembers: () => {
        throw new Error("Unexpected Slack read");
      },
      ...slack,
    },
  });
}
