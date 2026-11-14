import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTaskService } from "../../src/core/tasks";
import { testTransactor } from "./testTransactor";

export function taskService(
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
) {
  return createTaskService({ orm, transact, logger: createLogger("silent") });
}
