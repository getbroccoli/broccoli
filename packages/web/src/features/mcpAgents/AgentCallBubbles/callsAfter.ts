/**
 * The calls newer than the one last shown, oldest first. `calls` is newest first;
 * `lastShownId` null means no call existed when the bubbles started, so every call is new.
 */
export function callsAfter<Call extends { id: string }>(
  calls: readonly Call[],
  lastShownId: string | null,
): Call[] {
  const lastShown = calls.findIndex(({ id }) => id === lastShownId);
  return calls.slice(0, lastShown === -1 ? calls.length : lastShown).reverse();
}
