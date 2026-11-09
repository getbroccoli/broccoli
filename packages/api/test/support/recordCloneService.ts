import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createRecordCloneService } from "../../src/core/records";
import { termsRecordType } from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";
import { termsService } from "./termsService";
import { testTransactor } from "./testTransactor";

/** Cloning records as startup wires it for terms, with every module on the supplied date. */
export function recordCloneService(orm: Orm, { today }: { today: string }) {
  return createRecordCloneService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    registry: {
      terms: {
        ...termsRecordType(orm, () => calendarDate(today)),
        clone: termsService(orm, { today }).cloneTerms,
      },
    },
  });
}
