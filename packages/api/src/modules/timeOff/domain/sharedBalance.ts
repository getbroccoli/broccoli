import type { PolicyVersion } from "./timeOffPolicy";

type Balance = PolicyVersion["balance"];

/** A policy as it counts today. */
interface CountingPolicy {
  id: string;
  balance: Balance;
}

/**
 * How a type with these policies counts: the balance kind most of them share, the oldest policy's
 * (smallest uuidv7 id) on a tie, or null with no policy.
 */
export function sharedBalance(policies: readonly CountingPolicy[]): Balance | null {
  const oldestFirst = [...policies].sort((a, b) => a.id.localeCompare(b.id));
  return oldestFirst.reduce<Balance | null>(
    (best, { balance }) =>
      best === null || countOf(policies, balance) > countOf(policies, best) ? balance : best,
    null,
  );
}

function countOf(policies: readonly CountingPolicy[], balance: Balance): number {
  return policies.filter((policy) => policy.balance === balance).length;
}
