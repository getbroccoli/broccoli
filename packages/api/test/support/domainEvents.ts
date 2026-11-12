import { type Orm, transactor } from "../../src/core/db";
import { createEventBus, type DomainEvent } from "../../src/core/events";
import { createLogger } from "../../src/core/logger";

/** Task and agent connection events delivered after the transaction commits. */
export function domainEvents(orm: Orm) {
  const events: DomainEvent[] = [];
  const eventBus = createEventBus(createLogger("silent"));
  eventBus.subscribe({
    "agentAccess.connection_changed": (payload) => {
      events.push({ type: "agentAccess.connection_changed", payload });
      return Promise.resolve();
    },
    "tasks.task_created": (payload) => {
      events.push({ type: "tasks.task_created", payload });
      return Promise.resolve();
    },
    "tasks.task_status_changed": (payload) => {
      events.push({ type: "tasks.task_status_changed", payload });
      return Promise.resolve();
    },
  });
  return { transact: transactor(orm, eventBus), events };
}
