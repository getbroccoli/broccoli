import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createRecordCloneService } from "../../src/core/records";
import { cloneTerms, termsRecordType } from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";
import { testTransactor } from "./testTransactor";
import { timeOffService } from "./timeOffService";

/** Cloning records as startup wires it for terms, with both modules on the supplied date. */
export function recordCloneService(orm: Orm, { today }: { today: string }) {
  const copyParts = timeOffService(orm, { today }).copyTermsPolicies;
  return createRecordCloneService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    registry: {
      terms: {
        ...termsRecordType(orm),
        clone: (ctx, tx, input) =>
          cloneTerms(ctx, tx, input, { copyParts, today: calendarDate(today) }),
      },
    },
  });
}
