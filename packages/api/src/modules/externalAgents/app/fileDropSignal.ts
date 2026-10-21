/**
 * Wakes the external agent's waits when the owner drops a file. In memory, so it reaches waits in
 * this API process only, which is all one instance runs.
 */
export interface FileDropSignal {
  /** Wakes every wait now. */
  notify(): void;
  /** Starts waiting for the next drop, for at most `ms`; `stop` ends the wait early. */
  listen(ms: number): { dropped: Promise<void>; stop: () => void };
}

export function createFileDropSignal(): FileDropSignal {
  const waiters = new Set<() => void>();
  return {
    notify: () => {
      for (const wake of waiters) {
        wake();
      }
    },
    listen: (ms) => {
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
  };
}
