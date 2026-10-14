import { type Orm, type Transact, transactor } from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import { createLogger } from "../../src/core/logger";

/** Transactions on `orm` for tests that do not check events: nobody subscribes. */
export function testTransactor(orm: Orm): Transact {
  return transactor(orm, createEventBus(createLogger("silent")));
}
