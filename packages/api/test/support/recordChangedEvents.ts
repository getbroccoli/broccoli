import { type Orm, transactor } from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import { createLogger } from "../../src/core/logger";
import type { RecordChanged } from "../../src/core/records";

export function recordChangedEvents(orm: Orm) {
  const events: RecordChanged[] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "records.changed": (event) => {
      events.push(event);
      return Promise.resolve();
    },
  });
  return { transact: transactor(orm, eventBus), events };
}
