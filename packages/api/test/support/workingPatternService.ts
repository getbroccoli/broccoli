import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import {
  createWorkingPatternPolicyService,
  createWorkingPatternService,
} from "../../src/modules/employees";
import { testTransactor } from "./testTransactor";

/** Both working pattern services on `orm`, with silent logs; pass `transact` to receive their events. */
export function workingPatternService(
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
) {
  const dependencies = { orm, transact, logger: createLogger("silent") };
  return {
    ...createWorkingPatternService(dependencies),
    ...createWorkingPatternPolicyService(dependencies),
  };
}
