import { createAgentActivityService } from "../../src/core/agentAccess";
import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { testTransactor } from "./testTransactor";

/** People's agent activity on `orm`, with a silent logger. */
export const agentActivityService = (
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
) =>
  createAgentActivityService({
    orm,
    transact,
    logger: createLogger("silent"),
  });
