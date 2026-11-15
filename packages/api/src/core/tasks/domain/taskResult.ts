import { z } from "zod";

import { ApplicationError } from "../../applicationError";

/** What a task asks its assignee to give when they mark it done; processes copy it from a step. */
export interface TaskResultForm {
  /** Only `choice` now; a `text` kind can come later. */
  kind: "choice";
  /** `buttons` in the task's header, at most three; `choices` as a list in its body. */
  display: "buttons" | "choices";
  options: TaskResultOption[];
}

/** One answer a form offers; features match its `code`, never its label. */
export interface TaskResultOption {
  code: string;
  label: string;
  commentRequired: boolean;
}

/** What the assignee gave: an option's code, and their comment. */
export interface TaskResult {
  code: string;
  comment: string | null;
}

/** Buttons sit in the task's header, which has room for three. */
const MAX_BUTTONS = 3;

/** A form as a feature defines it; fills `display` and `commentRequired` when left out. */
export const TASK_RESULT_FORM_SCHEMA: z.ZodType<TaskResultForm, unknown> = z
  .object({
    kind: z.literal("choice"),
    display: z.enum(["buttons", "choices"]).default("buttons"),
    options: z
      .array(
        z.object({
          code: z.string().regex(/^[a-z][a-z0-9_]*$/),
          label: z.string().trim().min(1),
          commentRequired: z.boolean().default(false),
        }),
      )
      .min(2),
  })
  .refine(({ display, options }) => display !== "buttons" || options.length <= MAX_BUTTONS, {
    message: `A form shown as buttons has at most ${MAX_BUTTONS} options.`,
  })
  .refine(({ options }) => new Set(options.map(({ code }) => code)).size === options.length, {
    message: "A form lists each code once.",
  });

/**
 * The result a done task keeps: one the form lists, its comment trimmed and null when blank;
 * refuses a result a task without a form, or a missing one a task with a form.
 */
export function acceptResult(
  form: TaskResultForm | null,
  result: TaskResult | null,
): TaskResult | null {
  if (form === null) {
    if (result !== null) {
      throw refused("result", "not_asked", "This task does not ask for a result.");
    }
    return null;
  }
  if (result === null) throw refused("result", "required", "Choose a result for this task.");
  const option = form.options.find(({ code }) => code === result.code);
  if (!option) throw refused("result.code", "unknown", "Choose one of this task's results.");
  const comment = result.comment?.trim() || null;
  if (option.commentRequired && comment === null) {
    throw refused("result.comment", "required", "Add a comment to this result.");
  }
  if (comment !== null && comment.length > MAX_RESULT_COMMENT_LENGTH) {
    throw refused(
      "result.comment",
      "too_long",
      `A comment has at most ${MAX_RESULT_COMMENT_LENGTH} characters.`,
    );
  }
  return { code: option.code, comment };
}

/** "No — VPN login fails", or "Yes" without a comment: a result as people read it. */
export function resultText(form: TaskResultForm, { code, comment }: TaskResult): string {
  const label = resultLabel(form, code);
  return comment === null ? label : `${label} — ${comment}`;
}

/** The label of the option with this code, which the form lists. */
export function resultLabel(form: TaskResultForm, code: string): string {
  return form.options.find((option) => option.code === code)!.label;
}

/** The longest comment a result keeps. */
const MAX_RESULT_COMMENT_LENGTH = 2000;

function refused(field: string, code: string, message: string): ApplicationError {
  return new ApplicationError("INVALID_INPUT", message, [{ field, code }]);
}
