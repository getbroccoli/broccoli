import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createMcpAgentToolService } from "../../src/modules/mcpAgents";
import { testTransactor } from "./testTransactor";

/** The MCP tools' service on `orm`, with a silent logger. */
export const mcpAgentToolService = (orm: Orm) =>
  createMcpAgentToolService({ orm, transact: testTransactor(orm), logger: createLogger("silent") });
