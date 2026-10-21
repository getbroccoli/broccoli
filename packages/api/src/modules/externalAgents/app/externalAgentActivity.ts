/**
 * What the external agent is doing, as this API process sees it, which is all one instance runs:
 * its waits for the owner's next drop, woken by each drop, and when it last called.
 */
export interface ExternalAgentActivity {
  /** Wakes every wait now: the owner dropped a file. */
  notifyDrop(): void;
  /** Starts waiting for the next drop, for at most `ms`; `stop` ends the wait early. */
  waitForDrop(ms: number): { dropped: Promise<void>; stop: () => void };
  /** Notes a call of the agent at `now`. */
  recordCall(now: Date): void;
  /** Whether the agent waits for files or called in the last 30 s, mapping between two waits. */
  isListening(now: Date): boolean;
}

export function createExternalAgentActivity(): ExternalAgentActivity {
  const waiters = new Set<() => void>();
  let lastCallAt = Number.NEGATIVE_INFINITY;
  return {
    notifyDrop: () => {
      for (const wake of waiters) {
        wake();
      }
    },
    waitForDrop: (ms) => {
      let stop = () => {};
      const dropped = new Promise<void>((resolve) => {
        stop = () => {
          clearTimeout(timeout);
          waiters.delete(stop);
          resolve();
        };
        const timeout = setTimeout(stop, ms);
        waiters.add(stop);
      });
      return { dropped, stop };
    },
    recordCall: (now) => {
      lastCallAt = now.getTime();
    },
    isListening: (now) => waiters.size > 0 || now.getTime() - lastCallAt < LISTENING_MS,
  };
}

/** How long after its last call the agent still counts as listening: enough to map a few files. */
const LISTENING_MS = 30_000;
