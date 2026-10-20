/**
 * Runs heavy file reads, such as Excel workbooks and PDFs, one at a time: each may hold a few
 * hundred megabytes while it runs. A read whose `signal` aborts while it waits rejects at once and
 * never starts.
 */
export function oneReadAtATime<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const work = queue.then(() => (signal?.aborted ? undefined : read())) as Promise<T>;
  // The next read waits for this one, whether it succeeded or not.
  queue = work.catch(() => undefined);
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    // An abort reason is a DOMException unless the caller passed its own error.
    const abort = () => reject(signal.reason as Error);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

let queue: Promise<unknown> = Promise.resolve();
