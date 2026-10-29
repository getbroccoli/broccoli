import type { IncomingHttpHeaders } from "node:http";

import { ApplicationError } from "../applicationError";
import {
  type EffectiveProfile,
  type Grant,
  type Operation,
  PERMISSION_PROFILES,
  type PermissionObject,
  type PermissionProfile,
  type ProfileDefinition,
  type RecordAction,
  type RecordScope,
  type Scope,
  type Subject,
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
   * action: creating a record tied to nobody yet, and ids that name no record.
   */
  requireEveryRecord(object: PermissionObject, action: RecordAction): void;

  /**
   * The records the caller's grants reach for the action, by subject, to filter reads before
   * paging; read once per context for each object and action. Never refuses: see `RecordScope`.
   */
  recordScope(object: PermissionObject, action: RecordAction): Promise<RecordScope>;

  /** Refuses with FORBIDDEN unless the record of this subject is in scope for the action. */
  requireInScope(object: PermissionObject, action: RecordAction, subject: Subject): Promise<void>;

  /**
   * Refuses with FORBIDDEN an update of this subject's record out of scope, or one that sends a
   * field the caller may not change, naming each such field; scope, fields and fixed rules in one call.
   */
  requireWrite(
    object: PermissionObject,
    subject: Subject,
    fields: readonly string[],
  ): Promise<void>;

  /**
   * What the caller may do to the record of each subject, fixed rules applied, by subject; one
   * reporting-line read for them all.
   */
  recordAccess(
    object: PermissionObject,
    subjects: readonly Subject[],
  ): Promise<Map<Subject, RecordAccess>>;
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
  /**
   * Everyone above each employee today, by employee: their direct manager first, then that one's,
   * and so on; employees without a manager are left out.
   */
  managersAbove(employeeIds: readonly string[]): Promise<Map<string, string[]>>;
  /** Everyone below the employee today, with their depth: 1 for a direct report, and so on. */
  reportsBelow(employeeId: string): Promise<{ id: string; depth: number }[]>;
  /** The employee linked to the owner's user; null without one. */
  ownersEmployeeId(): Promise<string | null>;
}

/** A signed-in user as application code sees them. */
export interface SignedInUser {
  userId: string;
  /** Sign-in email, lowercased, for display; never used for authorization. */
  email: string;
  isOwner: boolean;
  /** `EMPLOYEE` first, then the stored profiles, and `OWNER` for the owner (`profilesOf`). */
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
    private readonly profiles: Record<PermissionProfile, ProfileDefinition> = PERMISSION_PROFILES,
  ) {}

  private ownersEmployeeId: Promise<string | null> | undefined;
  private effective: EffectiveProfile | undefined;
  private readonly scopes = new Map<string, Promise<RecordScope>>();

  /** A signed-in user; built by `resolveSecurityContext`, and by tests with other profiles. */
  static user(
    user: SignedInUser,
    directory: EmployeeDirectory,
    profiles?: Record<PermissionProfile, ProfileDefinition>,
  ): SecurityContext {
    return new PrincipalSecurityContext({ ...user }, false, null, directory, profiles);
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

  recordScope(object: PermissionObject, action: RecordAction): Promise<RecordScope> {
    const key = `${object}.${action}`;
    let scope = this.scopes.get(key);
    if (!scope) {
      scope = this.resolveScope(this.isSystem ? "all" : this.grants(object, action), action);
      this.scopes.set(key, scope);
    }
    return scope;
  }

  async requireInScope(
    object: PermissionObject,
    action: RecordAction,
    subject: Subject,
  ): Promise<void> {
    const access = await this.actionsOn(object, subject, [action]);
    if (!access.has(action)) {
      throw new ApplicationError("FORBIDDEN", NOT_ALLOWED);
    }
    if (action === "delete" && (await this.isOwnersEmployee(object, subject))) {
      throw new ApplicationError("FORBIDDEN", "The owner cannot be deleted.");
    }
  }

  async requireWrite(
    object: PermissionObject,
    subject: Subject,
    fields: readonly string[],
  ): Promise<void> {
    const writable = (await this.actionsOn(object, subject, ["update"])).get("update");
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

  async recordAccess(
    object: PermissionObject,
    subjects: readonly Subject[],
  ): Promise<Map<Subject, RecordAccess>> {
    const access = await this.actionsOnEach(object, subjects, ["update", "delete"]);
    const records = new Map<Subject, RecordAccess>();
    for (const [subject, actions] of access) {
      records.set(subject, {
        canUpdate: actions.has("update"),
        canDelete: actions.has("delete") && !(await this.isOwnersEmployee(object, subject)),
        writableFields: actions.get("update") ?? [],
      });
    }
    return records;
  }

  /** The union of the user's profiles; null for anyone without a user. */
  private profile(): EffectiveProfile | null {
    if (!this.user) return null;
    this.effective ??= {
      grants: this.user.permissionProfiles.flatMap((name) => this.profiles[name].grants),
      operations: new Set(
        this.user.permissionProfiles.flatMap((name) => this.profiles[name].operations),
      ),
    };
    return this.effective;
  }

  private grants(object: PermissionObject, action: RecordAction): readonly Grant[] {
    return (this.profile()?.grants ?? []).filter(
      (grant) => grant.object === object && grant.actions.includes(action),
    );
  }

  /**
   * The subjects these grants reach for the action; "all" for system or a grant on `all`. Every
   * object has employee subjects today: an object about another kind resolves its scopes here.
   */
  private async resolveScope(
    grants: readonly Grant[] | "all",
    action: RecordAction,
  ): Promise<RecordScope> {
    if (grants === "all" || grants.some(({ scope }) => scope === "all")) return "all";
    if (grants.length === 0) return "none";
    const scopes = new Set(grants.map(({ scope }) => scope));
    const reached = new Set<Subject>(action === "read" ? ["public"] : []);
    const employeeId = this.user?.employeeId;
    if (!employeeId) return [...reached];
    if (scopes.has("self")) reached.add(employeeId);
    if (scopes.has("direct_reports") || scopes.has("all_reports")) {
      for (const { id, depth } of await this.directory!.reportsBelow(employeeId)) {
        if (depth === 1 || scopes.has("all_reports")) reached.add(id);
      }
    }
    if (scopes.has("managers")) {
      const above = await this.directory!.managersAbove([employeeId]);
      for (const id of above.get(employeeId) ?? []) reached.add(id);
    }
    return [...reached];
  }

  /** The actions among `actions` the caller holds on the subject, each with the fields it may write. */
  private async actionsOn(
    object: PermissionObject,
    subject: Subject,
    actions: readonly RecordAction[],
  ): Promise<Map<RecordAction, "*" | readonly string[]>> {
    return (await this.actionsOnEach(object, [subject], actions)).get(subject)!;
  }

  /** `actionsOn` for each subject, by subject, reading the reporting line once for them all. */
  private async actionsOnEach(
    object: PermissionObject,
    subjects: readonly Subject[],
    actions: readonly RecordAction[],
  ): Promise<Map<Subject, Map<RecordAction, "*" | readonly string[]>>> {
    if (this.isSystem) {
      return new Map(subjects.map((subject) => [subject, new Map(actions.map((a) => [a, "*"]))]));
    }
    const grants = actions.map((action) => [action, this.grants(object, action)] as const);
    const employeeId = this.user?.employeeId ?? null;
    const needsLine = grants.some(([, held]) =>
      held.some(({ scope }) => scope !== "all" && scope !== "self"),
    );
    // The subjects' lines answer the report scopes; the caller's own line answers `managers`.
    const managersAbove =
      employeeId && needsLine
        ? await this.directory!.managersAbove([
            ...subjects.filter((subject) => subject !== "public"),
            employeeId,
          ])
        : new Map<string, string[]>();
    const reaches = (scope: Scope, action: RecordAction, subject: Subject): boolean => {
      if (scope === "all") return true;
      if (subject === "public") return action === "read";
      if (employeeId === null) return false;
      if (scope === "self") return subject === employeeId;
      if (scope === "managers") return (managersAbove.get(employeeId) ?? []).includes(subject);
      const above = managersAbove.get(subject) ?? [];
      return scope === "direct_reports" ? above[0] === employeeId : above.includes(employeeId);
    };
    return new Map(
      subjects.map((subject) => {
        const access = new Map<RecordAction, "*" | readonly string[]>();
        for (const [action, held] of grants) {
          for (const grant of held) {
            if (!reaches(grant.scope, action, subject)) continue;
            const before = access.get(action) ?? [];
            const fields = grant.fields ?? [];
            access.set(
              action,
              before === "*" || fields === "*" ? "*" : [...new Set([...before, ...fields])],
            );
          }
        }
        return [subject, access];
      }),
    );
  }

  /** Whether the record is the owner's employee, which nobody deletes. */
  private async isOwnersEmployee(object: PermissionObject, subject: Subject): Promise<boolean> {
    if (object !== "employee") return false;
    // Read once per context, which lives for one request.
    this.ownersEmployeeId ??= this.directory?.ownersEmployeeId() ?? Promise.resolve(null);
    return (await this.ownersEmployeeId) === subject;
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
