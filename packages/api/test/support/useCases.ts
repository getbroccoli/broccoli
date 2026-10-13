import { createEventBus } from "../../src/core/events";
import { createLogger, type Logger } from "../../src/core/logger";
import { type BrandLookup } from "../../src/integrations/brandLookup";
import { createCompanyUseCases } from "../../src/modules/company";
import { createDemoUseCases } from "../../src/modules/demo";

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
