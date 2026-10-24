import { z } from "zod";

import { invalidInput } from "../../applicationError";
import type { SecurityContext } from "../../security";

/** The record types that keep history; a module adds its own by declaration merging (`employee: true`). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging.
export interface RecordTypes {}

export type RecordType = keyof RecordTypes;

/**
 * Why a change happened. Core declares the direct edit every record type has; the module
 * whose action causes a change declares its own kind by declaration merging.
 */
export interface CauseKinds {
  EDITED_DIRECTLY: true;
}

export type CauseKind = keyof CauseKinds;

export type RecordOperation = "CREATED" | "UPDATED" | "DELETED";

/** Who made a change, as the security context names them. */
export type AuthorKind = "SIGNED_IN_USER" | "BROCCOLI_ITSELF" | "SETUP_HOLDER" | "EXTERNAL_AGENT";

/** One field's value before and after a change, in its API form; null when empty. */
export interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface HistoryAuthor {
  kind: AuthorKind;
  /** The user's id, or the external agent's session id; null for Broccoli itself and the setup holder. */
  id: string | null;
}

export interface HistoryCause {
  kind: CauseKind;
  /** The id of what caused the change, such as a scheduled change; its kind says what it is. */
  ref: string | null;
}

/** One change to one record: who made it, when, why, and each field's old and new value. */
export interface HistoryLine {
  /** A decimal string; lines of one record are ordered by it. */
  id: string;
  recordType: RecordType;
  recordId: string;
  operation: RecordOperation;
  occurredAt: Date;
  author: HistoryAuthor;
  cause: HistoryCause;
  /** Why, in the author's words. */
  reason: string | null;
  changes: FieldChange[];
}

/** One change of one kind to several records of one type, such as an import. */
export interface HistoryAppend {
  recordType: RecordType;
  operation: RecordOperation;
  cause: { kind: CauseKind; ref?: string | null };
  reason?: string | null;
  records: { recordId: string; changes: FieldChange[] }[];
}

/** The author of a change made with `ctx`. */
export function authorOf(ctx: SecurityContext): HistoryAuthor {
  if (ctx.user) {
    return { kind: "SIGNED_IN_USER", id: ctx.user.userId };
  }
  if (ctx.isSetupHolder) {
    return { kind: "SETUP_HOLDER", id: null };
  }
  if (ctx.externalAgentSessionId !== null) {
    return { kind: "EXTERNAL_AGENT", id: ctx.externalAgentSessionId };
  }
  return { kind: "BROCCOLI_ITSELF", id: null };
}

const REASON_MAX_LENGTH = 500;

/**
 * The `changeReason` an input sends with a change, kept as the line's reason: trimmed, at most
 * 500 characters, null when blank. Named so it never reads as a field of the record.
 */
export const changeReasonSchema = z
  .string()
  .trim()
  .max(REASON_MAX_LENGTH)
  .nullish()
  .transform((reason) => reason || null);

/** Validates a change's reason alone, as `changeReasonSchema` does; throws `INVALID_INPUT` when too long. */
export function parseChangeReason(changeReason: string | null | undefined): string | null {
  const result = changeReasonSchema.safeParse(changeReason);
  if (!result.success) {
    throw invalidInput([{ field: "changeReason", code: "too_long" }]);
  }
  return result.data;
}
