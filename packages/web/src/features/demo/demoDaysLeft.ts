const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left until the demo ends at `expiresAt`, rounded up; 0 once it has ended. */
export function demoDaysLeft(expiresAt: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS));
}
