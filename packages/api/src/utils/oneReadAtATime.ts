/**
 * Runs heavy file reads, such as Excel workbooks and PDFs, one at a time: each may hold a few
 * hundred megabytes while it runs.
 */
export function oneReadAtATime<T>(read: () => Promise<T>): Promise<T> {
  const result = queue.then(read);
  // The next read waits for this one, whether it succeeded or not.
  queue = result.catch(() => undefined);
  return result;
}

let queue: Promise<unknown> = Promise.resolve();
