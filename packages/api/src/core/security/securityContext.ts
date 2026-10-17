import { ApplicationError } from "../applicationError";

/**
 * Who is calling application code, and what they may do. Every business function
 * in `app` takes it first, as `ctx`. A hand-written interface, unlike our other
 * code, so tests can implement it (`TestSecurityContext`).
 */
export interface SecurityContext {
  /**
   * The effective signed-in user; null for work Broccoli does on its own and for the
   * setup holder. A request without either session has no security context at all.
   */
  readonly user: Readonly<SignedInUser> | null;

  /** Whether Broccoli acts on its own; then `user` is null. */
  readonly isSystem: boolean;

  /** Whether the browser holding setup calls, before the owner exists; then `user` is null. */
  readonly isSetupHolder: boolean;

  /** Until permissions exist: the owner or Broccoli itself; refuses others with FORBIDDEN. */
  requireOwnerOrSystem(): void;

  /** Setup work: the owner, Broccoli itself or the setup holder; refuses others with FORBIDDEN. */
  requireSetupAccess(): void;

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

/** The security context of a user, the setup holder or Broccoli itself, under today's owner-only rule. */
export class PrincipalSecurityContext implements SecurityContext {
  private constructor(
    readonly user: Readonly<SignedInUser> | null,
    readonly isSetupHolder: boolean,
  ) {}

  /** A signed-in user; built by `resolveSecurityContext`. */
  static user(user: SignedInUser): SecurityContext {
    return new PrincipalSecurityContext({ ...user }, false);
  }

  /** The browser holding setup; built by `resolveSecurityContext`. */
  static setupHolder(): SecurityContext {
    return new PrincipalSecurityContext(null, true);
  }

  /** Broccoli acting on its own: setup, sign-in, init and event handlers. */
  static system(): SecurityContext {
    return new PrincipalSecurityContext(null, false);
  }

  get isSystem(): boolean {
    return this.user === null && !this.isSetupHolder;
  }

  requireOwnerOrSystem(): void {
    if (!this.isSystem && !this.user?.isOwner) {
      throw new ApplicationError("FORBIDDEN", "Only the owner can do this.");
    }
  }

  requireSetupAccess(): void {
    if (!this.isSetupHolder) {
      this.requireOwnerOrSystem();
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
