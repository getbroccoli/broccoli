/**
 * The calls made after `lastShownAt`, oldest first; `calls` is newest first. null means no call
 * existed when the bubbles started, so every call is new.
 */
export function callsAfter<Call extends { calledAt: string }>(
  calls: readonly Call[],
  lastShownAt: string | null,
): Call[] {
  const after = lastShownAt === null ? -Infinity : Date.parse(lastShownAt);
  return calls.filter(({ calledAt }) => Date.parse(calledAt) > after).reverse();
}
