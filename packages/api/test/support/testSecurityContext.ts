import { ApplicationError } from "../../src/core/applicationError";
import type { SecurityContext, SignedInUser } from "../../src/core/security";

/**
 * A security context whose answers a test sets. Today it follows the owner-only
 * rule; later a test also sets the scope or the hidden fields it is about.
 */
export class TestSecurityContext implements SecurityContext {
  readonly user: Readonly<SignedInUser> | null;
  readonly isSetupHolder: boolean;
  readonly agentSessionId: string | null;

  constructor({
    user,
    isSetupHolder = false,
    agentSessionId = null,
  }: {
    user: SignedInUser | null;
    isSetupHolder?: boolean;
    agentSessionId?: string | null;
  }) {
    this.user = user;
    this.isSetupHolder = isSetupHolder;
    this.agentSessionId = agentSessionId;
  }

  get isSystem(): boolean {
    return this.user === null && !this.isSetupHolder && this.agentSessionId === null;
  }

  requireSetupAccess(): void {
    if (!this.isSetupHolder) this.requireOwnerOrSystem();
  }

  requireOwnerOrSystem(): void {
    if (!this.isSystem && !this.user?.isOwner) {
      throw new ApplicationError("FORBIDDEN", "Only the owner can do this.");
    }
  }

  requireSetupAgent(): string {
    if (this.agentSessionId === null) {
      throw new ApplicationError("FORBIDDEN", "Only your agent can do this.");
    }
    return this.agentSessionId;
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

/** The browser holding setup before the owner exists. */
export const SETUP_HOLDER = new TestSecurityContext({ user: null, isSetupHolder: true });

export const SETUP_AGENT = new TestSecurityContext({
  user: null,
  agentSessionId: "test-agent-session",
});
