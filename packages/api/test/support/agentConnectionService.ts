import { createAgentConnectionService } from "../../src/core/agentAccess";
import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { testTransactor } from "./testTransactor";

/** People's agent connections on `orm`, with a silent logger. */
export const agentConnectionService = (
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
) =>
  createAgentConnectionService({
    orm,
    transact,
    logger: createLogger("silent"),
  });
