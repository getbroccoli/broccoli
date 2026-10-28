import type { IncomingHttpHeaders } from "node:http";

import { ApplicationError } from "../applicationError";
import {
  type EffectiveProfile,
  type Grant,
  type Operation,
  PERMISSION_PROFILES,
  type PermissionObject,
  type PermissionProfile,
  type RecordAction,
  type Scope,
} from "./permissions";

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

  /** The session of the owner's own coding agent that calls, during setup; null for anyone else. */
  readonly externalAgentSessionId: string | null;

  /** Whether the caller holds the operation; system always does. */
  can(operation: Operation): boolean;

  /** Refuses with FORBIDDEN, naming who may do it, unless the caller holds the operation. */
  require(operation: Operation): void;

  /** Broccoli's own work, which no user starts; refuses everyone else with FORBIDDEN. */
  requireSystem(): void;

  /** Setup work: the setup holder, or whoever holds the operation; refuses others with FORBIDDEN. */
  requireSetupAccess(operation: Operation): void;

  /** The external agent's own work: its session id; refuses everyone else with FORBIDDEN. */
  requireSetupExternalAgent(): string;

  /**
   * Refuses with FORBIDDEN unless the caller's grants reach every record of the object for the
   * action: lists while reads reach everyone, and creating a record tied to nobody yet.
   */
  requireEveryRecord(object: PermissionObject, action: RecordAction): void;

  /** Refuses with FORBIDDEN unless the record of this subject is in scope for the action. */
  requireInScope(
    object: PermissionObject,
    action: RecordAction,
    subjectEmployeeId: string,
  ): Promise<void>;

  /**
   * Refuses with FORBIDDEN an update of this subject's record out of scope, or one that sends a
   * field the caller may not change, naming each such field; scope, fields and fixed rules in one call.
   */
  requireWrite(
    object: PermissionObject,
    subjectEmployeeId: string,
    fields: readonly string[],
  ): Promise<void>;

  /** What the caller may do to the record of this subject, fixed rules applied. */
  recordAccess(object: PermissionObject, subjectEmployeeId: string): Promise<RecordAccess>;
}

/** What the caller may do to one record. */
export interface RecordAccess {
  canUpdate: boolean;
  canDelete: boolean;
  /** "*" for every ordinary editable field; empty unless `canUpdate`. */
  writableFields: "*" | readonly string[];
}

/** What permission checks read about people; the module that keeps employees provides it. */
export interface EmployeeDirectory {
  /** The employee linked to this user; null without one. */
  employeeIdOfUser(userId: string): Promise<string | null>;
  /** Everyone above the employee today: their direct manager first, then that one's, and so on. */
  managersAbove(employeeId: string): Promise<string[]>;
  /** The employee linked to the owner's user; null without one. */
  ownersEmployeeId(): Promise<string | null>;
}

/** A signed-in user as application code sees them. */
export interface SignedInUser {
  userId: string;
  /** Sign-in email, lowercased, for display; never used for authorization. */
  email: string;
  isOwner: boolean;
  /** `EMPLOYEE` first, then the stored extras, and `OWNER` for the owner (`profilesOf`). */
  permissionProfiles: readonly PermissionProfile[];
  /** The employee linked to this user; null without one. */
  employeeId: string | null;
}

const OPERATION_REFUSALS: Record<Operation, string> = {
  MANAGE_WORKSPACE: "Only admins can do this.",
  RESET_WORKSPACE: "Only the owner can do this.",
};

const NOT_ALLOWED = "You are not allowed to do this.";

/** The security context of a user, the setup holder, the owner's external agent or Broccoli itself. */
export class PrincipalSecurityContext implements SecurityContext {
  private constructor(
    readonly user: Readonly<SignedInUser> | null,
    readonly isSetupHolder: boolean,
    readonly externalAgentSessionId: string | null = null,
    private readonly directory: EmployeeDirectory | null = null,
  ) {}

  private ownersEmployeeId: Promise<string | null> | undefined;
  private effective: EffectiveProfile | undefined;

  /** A signed-in user; built by `resolveSecurityContext`. */
  static user(user: SignedInUser, directory: EmployeeDirectory): SecurityContext {
    return new PrincipalSecurityContext({ ...user }, false, null, directory);
  }

  /** The browser holding setup; built by `resolveSecurityContext`. */
  static setupHolder(): SecurityContext {
    return new PrincipalSecurityContext(null, true);
  }

  /** The owner's external agent during setup, by its session; built by the agent routes. */
  static setupExternalAgent(sessionId: string): SecurityContext {
    return new PrincipalSecurityContext(null, false, sessionId);
  }

  /** Broccoli acting on its own: setup, sign-in, init and event handlers. */
  static system(): SecurityContext {
    return new PrincipalSecurityContext(null, false);
  }

  get isSystem(): boolean {
    return this.user === null && !this.isSetupHolder && this.externalAgentSessionId === null;
  }

  can(operation: Operation): boolean {
    return this.isSystem || this.profile()?.operations.has(operation) === true;
  }

  require(operation: Operation): void {
    if (!this.can(operation)) {
      throw new ApplicationError("FORBIDDEN", OPERATION_REFUSALS[operation]);
    }
  }

  requireSystem(): void {
    if (!this.isSystem) {
      throw new ApplicationError("FORBIDDEN", "Only Broccoli can do this.");
    }
  }

  requireSetupAccess(operation: Operation): void {
    if (!this.isSetupHolder) {
      this.require(operation);
    }
  }

  requireSetupExternalAgent(): string {
    if (this.externalAgentSessionId === null) {
      throw new ApplicationError("FORBIDDEN", "Only your agent can do this.");
    }
    return this.externalAgentSessionId;
  }

  requireEveryRecord(object: PermissionObject, action: RecordAction): void {
    if (!this.isSystem && !this.grants(object, action).some(({ scope }) => scope === "all")) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
  }

  async requireInScope(
    object: PermissionObject,
    action: RecordAction,
    subjectEmployeeId: string,
  ): Promise<void> {
    const access = await this.actionsOn(object, subjectEmployeeId, [action]);
    if (!access.has(action)) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
    if (action === "delete" && (await this.isOwnersEmployee(subjectEmployeeId))) {
      throw new ApplicationError("FORBIDDEN", "The owner cannot be deleted.");
    }
  }

  async requireWrite(
    object: PermissionObject,
    subjectEmployeeId: string,
    fields: readonly string[],
  ): Promise<void> {
    const writable = (await this.actionsOn(object, subjectEmployeeId, ["update"])).get("update");
    if (!writable) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
    const refused = writable === "*" ? [] : fields.filter((field) => !writable.includes(field));
    if (refused.length > 0) {
      throw new ApplicationError(
        "FORBIDDEN",
        "You cannot change some of these fields.",
        refused.map((field) => ({ field, code: "not_allowed" })),
      );
    }
  }

  async recordAccess(object: PermissionObject, subjectEmployeeId: string): Promise<RecordAccess> {
    const access = await this.actionsOn(object, subjectEmployeeId, ["update", "delete"]);
    return {
      canUpdate: access.has("update"),
      canDelete: access.has("delete") && !(await this.isOwnersEmployee(subjectEmployeeId)),
      writableFields: access.get("update") ?? [],
    };
  }

  /** The union of the user's profiles; null for anyone without a user. */
  private profile(): EffectiveProfile | null {
    if (!this.user) return null;
    this.effective ??= {
      grants: this.user.permissionProfiles.flatMap((name) => PERMISSION_PROFILES[name].grants),
      operations: new Set(
        this.user.permissionProfiles.flatMap((name) => [...PERMISSION_PROFILES[name].operations]),
      ),
    };
    return this.effective;
  }

  private grants(object: PermissionObject, action: RecordAction): readonly Grant[] {
    return (this.profile()?.grants ?? []).filter(
      (grant) => grant.object === object && grant.actions.includes(action),
    );
  }

  /** The actions among `actions` the caller holds on the subject, each with the fields it may write. */
  private async actionsOn(
    object: PermissionObject,
    subjectEmployeeId: string,
    actions: readonly RecordAction[],
  ): Promise<Map<RecordAction, "*" | readonly string[]>> {
    if (this.isSystem) {
      return new Map(actions.map((action) => [action, "*"]));
    }
    let managersAbove: Promise<string[]> | undefined;
    const reaches = async (scope: Scope): Promise<boolean> => {
      const employeeId = this.user?.employeeId ?? null;
      if (scope === "all") return true;
      if (employeeId === null) return false;
      if (scope === "self") return subjectEmployeeId === employeeId;
      managersAbove ??= this.directory!.managersAbove(subjectEmployeeId);
      const above = await managersAbove;
      return scope === "direct_reports" ? above[0] === employeeId : above.includes(employeeId);
    };
    const access = new Map<RecordAction, "*" | readonly string[]>();
    for (const action of actions) {
      for (const grant of this.grants(object, action)) {
        if (!(await reaches(grant.scope))) continue;
        const held = access.get(action) ?? [];
        const fields = grant.fields ?? [];
        access.set(
          action,
          held === "*" || fields === "*" ? "*" : [...new Set([...held, ...fields])],
        );
      }
    }
    return access;
  }

  private async isOwnersEmployee(subjectEmployeeId: string): Promise<boolean> {
    // Read once per context, which lives for one request.
    this.ownersEmployeeId ??= this.directory?.ownersEmployeeId() ?? Promise.resolve(null);
    return (await this.ownersEmployeeId) === subjectEmployeeId;
  }
}

/** The security context of a request, and the session cookies to send back with the response. */
export interface RequestSecurity {
  /** Null without a valid session. */
  security: SecurityContext | null;
  /** `Set-Cookie` values for a session that was due for renewal; empty otherwise. */
  renewedCookies: string[];
}

/** Reads the security context of a request from its headers; see `resolveSecurityContext`. */
export type SecurityResolver = (headers: IncomingHttpHeaders) => Promise<RequestSecurity>;

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
