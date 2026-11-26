import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createMcpAgentToolService } from "../../src/modules/mcpAgents";
import { bankHolidayService } from "./bankHolidayService";
import { calendarDate } from "./calendarDate";
import { approvalService } from "./processService";
import { taskService } from "./taskService";
import { testTransactor } from "./testTransactor";
import { timeOffService } from "./timeOffService";

/** The MCP tools on the test date, with real time off and tasks. */
export function mcpAgentToolService(
  orm: Orm,
  {
    today = () => calendarDate("2026-11-26"),
    transact = testTransactor(orm),
    timeOff = timeOffService(orm, { today: today() }),
    tasks = taskService(orm, { transact }),
    approvals = approvalService(orm, { transact }),
  } = {},
) {
  return createMcpAgentToolService({
    orm,
    transact,
    logger: createLogger("silent"),
    today,
    timeOff,
    bankHolidays: bankHolidayService(),
    approvals,
    tasks,
  });
}
