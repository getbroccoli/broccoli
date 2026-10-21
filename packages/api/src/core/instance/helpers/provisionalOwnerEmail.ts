import { randomBytes } from "node:crypto";

/**
 * A unique sign-in email for the provisional owner, in the reserved `.invalid` domain, so
 * it never reaches a real mailbox; never read to tell a demo apart.
 */
export function provisionalOwnerEmail(): string {
  return `demo-${randomBytes(8).toString("hex")}@demo.invalid`;
}
