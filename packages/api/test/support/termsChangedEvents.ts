import { type Orm, transactor } from "../../src/core/db";
import { createEventBus, type DomainEvents } from "../../src/core/events";
import { createLogger } from "../../src/core/logger";

/** Collects terms changes delivered after the transaction commits. */
export function termsChangedEvents(orm: Orm) {
  const events: DomainEvents["employees.terms_changed"][] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "employees.terms_changed": (event) => {
      events.push(event);
      return Promise.resolve();
    },
  });
  return { transact: transactor(orm, eventBus), events };
}
