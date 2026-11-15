/**
 * The calls to show as new bubbles, oldest first: made after `startId` (the newest call when the
 * bubbles started; null when there was none) and not in `shownIds`. `calls` is newest first, and ids
 * are bigint decimal strings that grow with each call.
 */
export function unshownCalls<Call extends { id: string }>(
  calls: readonly Call[],
  startId: string | null,
  shownIds: ReadonlySet<string>,
): Call[] {
  const start = startId === null ? null : BigInt(startId);
  return calls
    .filter(({ id }) => (start === null || BigInt(id) > start) && !shownIds.has(id))
    .reverse();
}
