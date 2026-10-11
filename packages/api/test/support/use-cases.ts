import { createEventBus } from "../../src/core/events";
import { createLogger, type Logger } from "../../src/core/logger";
import { type BrandLookup, createCompanyUseCases } from "../../src/modules/company";

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
