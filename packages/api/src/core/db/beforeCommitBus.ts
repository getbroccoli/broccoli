import type { PublishedEvent } from "../events";
import type { Tx } from "./transaction";

/** Reacts to a transaction's events inside it, before it commits; an error rolls it back. */
export type BeforeCommitHandler = (tx: Tx, events: readonly PublishedEvent[]) => Promise<void>;

/**
 * Hands each transaction's events to the modules that must react in the same transaction, such as
 * processes starting their runs, so the reaction commits with the change or not at all.
 */
export interface BeforeCommitBus {
  subscribe(handler: BeforeCommitHandler): void;
  /** Runs each subscribed handler in turn on the events; the first failure is thrown. */
  deliver(tx: Tx, events: readonly PublishedEvent[]): Promise<void>;
}

export function createBeforeCommitBus(): BeforeCommitBus {
  const handlers: BeforeCommitHandler[] = [];
  return {
    subscribe(handler) {
      handlers.push(handler);
    },

    async deliver(tx, events) {
      for (const handler of handlers) {
        await handler(tx, events);
      }
    },
  };
}
