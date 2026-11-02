import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import {
  createGroupWorkingPatternService,
  createWorkingPatternService,
  createEmployeeWorkingPatternService,
} from "../../src/modules/employees";
import { testTransactor } from "./testTransactor";

/** Every working pattern service on `orm`, with silent logs; pass `transact` to receive their events. */
export function workingPatternService(
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
) {
  const dependencies = { orm, transact, logger: createLogger("silent") };
  return {
    ...createEmployeeWorkingPatternService(dependencies),
    ...createWorkingPatternService(dependencies),
    ...createGroupWorkingPatternService(dependencies),
  };
}
