import type { Logger } from "../logger";

/**
 * Every event a module can publish, by type. Publishers add their events by
 * declaration merging, so no central list has to be edited.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging.
export interface DomainEvents {}

export type EventType = keyof DomainEvents;

export type DomainEvent = {
  [Type in EventType]: { type: Type; payload: DomainEvents[Type] };
}[EventType];

/** What a module does when an event happens, by event type. */
export type EventHandlers = {
  [Type in EventType]?: (payload: DomainEvents[Type]) => Promise<void>;
};

export interface EventBus {
  subscribe(handlers: EventHandlers): void;
  /** Runs each subscribed handler in turn; a failing handler is logged, never thrown. */
  dispatch(events: readonly DomainEvent[]): Promise<void>;
}

/**
 * Delivers events to the handlers of every module, in process. Events are
 * dispatched after the transaction that published them commits.
 */
export function createEventBus(logger: Logger): EventBus {
  const subscriptions: EventHandlers[] = [];

  async function deliver({ type, payload }: DomainEvent): Promise<void> {
    for (const handlers of subscriptions) {
      // Narrowing by `type` does not reach a mapped handler type, hence the cast.
      const handler = handlers[type] as ((payload: unknown) => Promise<void>) | undefined;
      try {
        await handler?.(payload);
      } catch (error) {
        logger.error({ err: error, eventType: type }, "Event handler failed");
      }
    }
  }

  return {
    subscribe(handlers) {
      subscriptions.push(handlers);
    },

    async dispatch(events) {
      for (const event of events) {
        await deliver(event);
      }
    },
  };
}
