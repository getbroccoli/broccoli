import type { TimeOffPolicy } from "./timeOffPolicy";

/**
 * How a type with these policies counts: the balance kind most of them share, the oldest policy's
 * (smallest uuidv7 id) on a tie, or null with no policy.
 */
export function sharedBalance(policies: readonly TimeOffPolicy[]): TimeOffPolicy["balance"] | null {
  const oldestFirst = [...policies].sort((a, b) => a.id.localeCompare(b.id));
  const countOf = (balance: TimeOffPolicy["balance"]) =>
    policies.filter((policy) => policy.balance === balance).length;
  return oldestFirst.reduce<TimeOffPolicy["balance"] | null>(
    (best, { balance }) => (best === null || countOf(balance) > countOf(best) ? balance : best),
    null,
  );
}
