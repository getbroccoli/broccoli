/**
 * Wakes the external agent's waits when the owner drops a file. In memory, so it reaches waits in
 * this API process only, which is all one instance runs.
 */
export interface FileDropSignal {
  /** Wakes every wait now. */
  notify(): void;
  /** Resolves on the next drop, or after `ms`. */
  next(ms: number): Promise<void>;
}

export function createFileDropSignal(): FileDropSignal {
  const waiters = new Set<() => void>();
  return {
    notify: () => {
      for (const wake of waiters) {
        wake();
      }
    },
    next: (ms) =>
      new Promise((resolve) => {
        const wake = () => {
          clearTimeout(timeout);
          waiters.delete(wake);
          resolve();
        };
        const timeout = setTimeout(wake, ms);
        waiters.add(wake);
      }),
  };
}
