import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import {
  createWorkingPatternService,
  createEmployeeWorkingPatternService,
} from "../../src/modules/employees";
import { OWNER } from "./testSecurityContext";
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
  };
}

/** A named Monday-to-Friday pattern of 7.5-hour days, called Standard, that people can be put on. */
export function createStandardPattern(orm: Orm) {
  return createWorkingPatternService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
  }).createPattern(OWNER, {
    name: "Standard",
    minutes: [450, 450, 450, 450, 450, 0, 0],
  });
}
