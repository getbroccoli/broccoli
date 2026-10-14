import { ApplicationError } from "../../src/core/applicationError";
import type { SecurityContext, SignedInUser } from "../../src/core/security";

/**
 * A security context whose answers a test sets. Today it follows the owner-only
 * rule; later a test also sets the scope or the hidden fields it is about.
 */
export class TestSecurityContext implements SecurityContext {
  readonly user: Readonly<SignedInUser> | null;

  constructor({ user }: { user: SignedInUser | null }) {
    this.user = user;
  }

  get isSystem(): boolean {
    return this.user === null;
  }

  requireOwnerOrSystem(): void {
    if (this.user && !this.user.isOwner) {
      throw new ApplicationError("FORBIDDEN", "Only the owner can do this.");
    }
  }
}

/** The owner as application code sees them. */
export const OWNER = new TestSecurityContext({
  user: { userId: "test-owner", email: "owner@example.com", isOwner: true },
});

/** A signed-in user who is not the owner. */
export const NON_OWNER = new TestSecurityContext({
  user: { userId: "test-user", email: "user@example.com", isOwner: false },
});

/** Broccoli acting on its own. */
export const SYSTEM = new TestSecurityContext({ user: null });
