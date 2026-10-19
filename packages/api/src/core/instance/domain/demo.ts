import { randomBytes } from "node:crypto";

/** How long the demo's provisional owner may use the app before creating their account. */
export const DEMO_DAYS = 7;

/** When a demo started at `now` ends; it never moves. */
export function demoExpiry(now: Date): Date {
  return new Date(now.getTime() + DEMO_DAYS * DAY_MS);
}

/**
 * A unique sign-in email for the provisional owner, in the reserved `.invalid` domain, so
 * it never reaches a real mailbox; never read to tell a demo apart.
 */
export function provisionalOwnerEmail(): string {
  return `demo-${randomBytes(8).toString("hex")}@demo.invalid`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
