import { ApplicationError } from "../applicationError";

/**
 * Who is calling application code, and what they may do. Every business function
 * in `app` takes it first, as `ctx`. A hand-written interface, unlike our other
 * code, so tests can implement it (`TestSecurityContext`).
 */
export interface SecurityContext {
  /**
   * The effective signed-in user; null only for work Broccoli does on its own. A
   * request without a session has no security context at all, never one without a user.
   */
  readonly user: Readonly<SignedInUser> | null;

  /** Whether Broccoli acts on its own; always `user === null`. */
  readonly isSystem: boolean;

  /** Until permissions exist: the owner or Broccoli itself; refuses others with FORBIDDEN. */
  requireOwnerOrSystem(): void;

  // Planned with the permission system and uncommented with their first caller,
  // together with their types: use cases will ask record scopes and field access
  // here, so no caller resolves grants itself. Async, because resolving a
  // reporting line reads the database.
  //
  // /** Which records of one object type the caller may touch for one action. */
  // recordScope(object: ObjectType, action: RecordAction): Promise<RecordScope>;
  //
  // /** Refuses with FORBIDDEN unless the record of this subject is in scope for the action. */
  // requireInScope(object: ObjectType, action: RecordAction, subjectEmployeeId: string): Promise<void>;
  //
  // /** Which fields of one object type the caller may read or write, per record. */
  // fieldAccess(object: ObjectType): Promise<FieldAccess>;
  //
  // /** The records a permission can apply to; one per record type that has rows. */
  // type ObjectType = "employee";
  // type RecordAction = "read" | "create" | "update" | "delete";
  // /** Resolved per object and action, so a grant's scope never spreads to another grant. */
  // type RecordScope = { kind: "all" } | …; // own, team, reporting line, criteria
  // interface FieldAccess {
  //   canRead(field: string, subjectEmployeeId: string): boolean;
  //   canWrite(field: string, subjectEmployeeId: string): boolean;
  // }
}

/** A signed-in user as application code sees them. */
export interface SignedInUser {
  userId: string;
  /** Sign-in email, lowercased, for display; never used for authorization. */
  email: string;
  isOwner: boolean;
}

/** The security context of a user or of Broccoli itself, under today's owner-only rule. */
export class PrincipalSecurityContext implements SecurityContext {
  private constructor(readonly user: Readonly<SignedInUser> | null) {}

  /** A signed-in user; built by `resolveSecurityContext`. */
  static user(user: SignedInUser): SecurityContext {
    return new PrincipalSecurityContext({ ...user });
  }

  /** Broccoli acting on its own: setup, sign-in, init and event handlers. */
  static system(): SecurityContext {
    return new PrincipalSecurityContext(null);
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

/** The security context of a request, and the session cookies to send back with the response. */
export interface RequestSecurity {
  /** Null without a valid session. */
  security: SecurityContext | null;
  /** `Set-Cookie` values for a session that was due for renewal; empty otherwise. */
  renewedCookies: string[];
}

/**
 * The security context of a request that needs a signed-in user. Adapters (GraphQL,
 * HTTP, MCP) call it, so application code always receives a context.
 */
export function requireSignedIn(security: SecurityContext | null): SecurityContext {
  if (!security) {
    throw new ApplicationError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return security;
}
