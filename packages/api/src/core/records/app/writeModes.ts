import { ApplicationError } from "../../applicationError";
import {
  isInRecordScope,
  type PermissionObject,
  type RecordAction,
  type SecurityContext,
  type Subject,
} from "../../security";

/** How the caller may write a record: straight away, only by asking for approval, or not at all. */
export type WriteMode = "direct" | "request" | "refused";

/**
 * The write mode of each subject's record, by subject; one reporting-line read for them all. A
 * record of someone else's is written straight away. Your own one is asked for, unless your
 * grants for the action reach everyone, as an admin's do.
 */
export async function writeModes(
  ctx: SecurityContext,
  object: PermissionObject,
  action: RecordAction,
  subjects: readonly Subject[],
): Promise<Map<Subject, WriteMode>> {
  const scope = await ctx.recordScope(object, action);
  const own = ctx.user?.employeeId;
  return new Map(
    subjects.map((subject): [Subject, WriteMode] => {
      if (!isInRecordScope(scope, subject)) return [subject, "refused"];
      return [subject, subject === own && scope !== "all" ? "request" : "direct"];
    }),
  );
}

/** Refuses with FORBIDDEN a write that is not `direct`, saying `whenRequest` when it could be asked for. */
export async function requireDirect(
  ctx: SecurityContext,
  object: PermissionObject,
  action: RecordAction,
  subject: Subject,
  whenRequest: string,
): Promise<void> {
  const mode = (await writeModes(ctx, object, action, [subject])).get(subject);
  if (mode === "refused")
    throw new ApplicationError("FORBIDDEN", "You are not allowed to do this.");
  if (mode === "request") throw new ApplicationError("FORBIDDEN", whenRequest);
}
