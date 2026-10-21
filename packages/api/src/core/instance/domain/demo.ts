import type { Instance } from "./instance";

/** How long the demo's provisional owner may use the app before creating their account. */
const DEMO_DAYS = 7;

/** When a demo started at `now` ends; it never moves. */
export function demoExpiry(now: Date): Date {
  return new Date(now.getTime() + DEMO_DAYS * DAY_MS);
}

/** When `userId` loses access as the demo's provisional owner; null for anyone else. */
export function demoDeadlineOf(instance: Instance, userId: string): Date | null {
  return instance.ownerUserId === userId ? instance.demoExpiresAt : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
