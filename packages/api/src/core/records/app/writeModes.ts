import { ApplicationError } from "../../applicationError";
import type { PermissionObject, RecordAction, SecurityContext, Subject } from "../../security";

/** How the caller may write records: straight away, only by asking for approval, or not at all. */
export interface WriteModeService {
  /**
   * The write mode of each subject's record, by subject; one reporting-line read for them all. A
   * record out of the caller's scope for the action is refused. In scope, someone else's record is
   * written straight away; your own one is asked for, unless your grants for the action reach
   * everyone, as an admin's do.
   */
  writeModes: (
    ctx: SecurityContext,
    object: PermissionObject,
    action: RecordAction,
    subjects: readonly Subject[],
  ) => Promise<Map<Subject, WriteMode>>;
  /**
   * Refuses with FORBIDDEN creating a record of the subject unless it is direct, saying
   * `whenRequest` when it could be asked for. Only the create check: other writes keep their own.
   */
  requireDirectCreate: (
    ctx: SecurityContext,
    object: PermissionObject,
    subject: Subject,
    whenRequest: string,
  ) => Promise<void>;
}

/** How the caller may write a record: straight away, only by asking for approval, or not at all. */
export type WriteMode = "direct" | "request" | "refused";

export function createWriteModeService(): WriteModeService {
  const service: WriteModeService = {
    writeModes: async (ctx, object, action, subjects) => {
      const scope = await ctx.recordScope(object, action);
      const reached = typeof scope === "string" ? null : new Set(scope);
      const own = ctx.user?.employeeId;
      return new Map(
        subjects.map((subject): [Subject, WriteMode] => {
          const inScope = scope === "all" || reached?.has(subject) === true;
          if (!inScope) return [subject, "refused"];
          return [subject, subject === own && scope !== "all" ? "request" : "direct"];
        }),
      );
    },
    requireDirectCreate: async (ctx, object, subject, whenRequest) => {
      const modes = await service.writeModes(ctx, object, "create", [subject]);
      const mode = modes.get(subject);
      if (mode === "refused") {
        throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
      }
      if (mode === "request") throw new ApplicationError("FORBIDDEN", whenRequest);
    },
  };
  return service;
}
