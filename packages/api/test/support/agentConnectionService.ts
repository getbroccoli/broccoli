import { createAgentConnectionService } from "../../src/core/agentAccess";
import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { testTransactor } from "./testTransactor";

/** People's agent connections on `orm`, with a silent logger. */
export const agentConnectionService = (orm: Orm) =>
  createAgentConnectionService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
  });
