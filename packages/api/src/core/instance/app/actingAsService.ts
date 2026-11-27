import { ApplicationError } from "../../applicationError";
import type { Orm } from "../../db";
import type { Logger } from "../../logger";
import {
  type EmployeeDirectory,
  isInRecordScope,
  type PermissionProfile,
  permissionProfileRepository,
  PrincipalSecurityContext,
  profilesOf,
  type SecurityContext,
} from "../../security";
import { actingSessionRepository, instanceRepository } from "../db";

/**
 * Acting as another employee in a browser session: Broccoli applies that employee's live rights,
 * records and tasks while the signed-in user stays the author of every change. Who may is one rule,
 * checked when the profile offers it, when acting starts and again on every request.
 */
export interface ActingAsService {
  /**
   * The ids among `employeeIds` the caller may act as now: a signed-in user in their own browser
   * session, whose `act_as` grant reaches the employee, never themselves, and only an employee whose
   * profiles the caller holds too, so acting adds no right.
   */
  actableEmployees: (ctx: SecurityContext, employeeIds: readonly string[]) => Promise<Set<string>>;
  /**
   * Makes the caller's session act as the employee; refuses with FORBIDDEN unless actable, and
   * when the session started acting as someone meanwhile.
   */
  startActing: (
    ctx: SecurityContext,
    acting: { sessionId: string; employeeId: string },
  ) => Promise<void>;
  /** Makes the session act as its signed-in user again; nothing when it does already. */
  stopActing: (ctx: SecurityContext, sessionId: string) => Promise<void>;
  /**
   * The security context of `actor` acting as the employee in this session, read afresh; null once
   * `actor` may no longer act as them, which also ends acting in that session.
   */
  resolveActing: (
    actor: SecurityContext,
    acting: { sessionId: string; employeeId: string },
  ) => Promise<SecurityContext | null>;
}

export function createActingAsService({
  orm,
  directory,
  logger,
}: {
  orm: Orm;
  directory: EmployeeDirectory;
  logger: Logger;
}): ActingAsService {
  const actableProfiles = (ctx: SecurityContext, employeeIds: readonly string[]) =>
    readActableProfiles({ orm, directory }, ctx, employeeIds);
  return {
    actableEmployees: async (ctx, employeeIds) =>
      new Set((await actableProfiles(ctx, employeeIds)).keys()),

    async startActing(ctx, { sessionId, employeeId }) {
      ctx.requireOwnIdentity();
      if (!(await actableProfiles(ctx, [employeeId])).has(employeeId)) {
        throw new ApplicationError("FORBIDDEN", "You cannot act as this person.");
      }
      if (!(await actingSessionRepository(orm).startActing(sessionId, employeeId))) {
        throw new ApplicationError("FORBIDDEN", "You are acting as someone already.");
      }
      logger.info({ userId: ctx.user?.userId, employeeId }, "Started acting as an employee");
    },

    async stopActing(ctx, sessionId) {
      await actingSessionRepository(orm).stopActing(sessionId);
      if (ctx.actor) {
        logger.info(
          { userId: ctx.actor.userId, employeeId: ctx.user?.employeeId },
          "Stopped acting as an employee",
        );
      }
    },

    async resolveActing(actor, { sessionId, employeeId }) {
      const profiles = (await actableProfiles(actor, [employeeId])).get(employeeId);
      if (!actor.user || !profiles) {
        await actingSessionRepository(orm).stopActingAs(sessionId, employeeId);
        logger.info(
          { userId: actor.user?.userId, employeeId },
          "Stopped acting as an employee the user may no longer act as",
        );
        return null;
      }
      return PrincipalSecurityContext.user(
        {
          ...actor.user,
          isOwner: profiles.includes("OWNER"),
          permissionProfiles: profiles,
          employeeId,
        },
        directory,
        { actor: actor.user },
      );
    },
  };
}

/** The live profiles of each employee among `employeeIds` the caller may act as, by employee. */
async function readActableProfiles(
  { orm, directory }: { orm: Orm; directory: EmployeeDirectory },
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<Map<string, PermissionProfile[]>> {
  const caller = ctx.user;
  if (!caller || ctx.actor || ctx.agentConnection) return new Map();
  const scope = await ctx.recordScope("employee", "act_as");
  const reached = employeeIds.filter(
    (id) => id !== caller.employeeId && isInRecordScope(scope, id),
  );
  if (reached.length === 0) return new Map();
  const profiles = await readProfilesOfEmployees({ orm, directory }, reached);
  const held = new Set(caller.permissionProfiles);
  return new Map([...profiles].filter(([, theirs]) => theirs.every((one) => held.has(one))));
}

/** Each existing employee's live profiles, by employee: `EMPLOYEE` alone for one who never joined. */
async function readProfilesOfEmployees(
  { orm, directory }: { orm: Orm; directory: EmployeeDirectory },
  employeeIds: readonly string[],
): Promise<Map<string, PermissionProfile[]>> {
  const users = await directory.usersOfEmployees(employeeIds);
  const userIds = [...users.values()].filter((userId) => userId !== null);
  const stored = await permissionProfileRepository(orm).findProfiles(userIds);
  const owner = await instanceRepository(orm).readOwner();
  return new Map(
    [...users].map(([employeeId, userId]) => [
      employeeId,
      profilesOf((userId && stored.get(userId)) || [], userId !== null && userId === owner?.userId),
    ]),
  );
}
