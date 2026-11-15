/**
 * The calls after the one last shown, oldest first; `calls` is newest first and ids grow with each
 * call. null means no call existed when the bubbles started, so every call is new.
 */
export function callsAfter<Call extends { id: string }>(
  calls: readonly Call[],
  lastShownId: string | null,
): Call[] {
  if (lastShownId === null) return calls.toReversed();
  const lastShown = BigInt(lastShownId);
  return calls.filter(({ id }) => BigInt(id) > lastShown).reverse();
}
