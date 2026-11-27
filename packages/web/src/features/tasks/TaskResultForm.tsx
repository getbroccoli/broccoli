import { useState } from "react";

import type { TaskResultInput } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import type { TaskRow } from "./taskText";
import { SECTION_LABEL } from "./sectionLabel";

type Props = {
  form: NonNullable<TaskRow["resultForm"]>;
  /** The option chosen so far: from the list here, or from a button in the panel's header. */
  chosenCode: string | null;
  onChoose: (code: string) => void;
  isPending: boolean;
  onSend: (result: TaskResultInput) => void;
};

/**
 * The part of a task's result form below its buttons, in the task panel's body or on the record it
 * decides: the options as a list when the form shows choices, and the comment box of a chosen
 * option that requires one, then Send.
 */
export function TaskResultForm({ form, chosenCode, onChoose, isPending, onSend }: Props) {
  const [comment, setComment] = useState("");
  const chosen = form.options.find(({ code }) => code === chosenCode) ?? null;
  const needsComment = chosen?.commentRequired ?? false;
  const canSend = chosen !== null && (!needsComment || comment.trim() !== "");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend && !isPending) {
          onSend({ code: chosen.code, comment: needsComment ? comment : null });
        }
      }}
    >
      {form.display === "CHOICES" && (
        <fieldset disabled={isPending} className="flex flex-col gap-2">
          <legend className={SECTION_LABEL}>{t("tasks.result.choose")}</legend>
          {form.options.map((option) => (
            <label
              key={option.code}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-[15px] has-checked:border-foreground has-checked:ring-1 has-checked:ring-foreground"
            >
              <input
                type="radio"
                name="task-result"
                checked={option.code === chosenCode}
                onChange={() => onChoose(option.code)}
                className="size-4 shrink-0 accent-foreground"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      )}
      {needsComment && (
        <label className="flex flex-col gap-1.5">
          <span className={SECTION_LABEL}>{t("tasks.result.comment")}</span>
          <textarea
            value={comment}
            disabled={isPending}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("tasks.result.commentPlaceholder")}
            rows={3}
            autoFocus
            className="min-h-20 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      )}
      {(form.display === "CHOICES" || needsComment) && (
        <Button type="submit" size="sm" disabled={!canSend || isPending} className="self-start">
          {t("tasks.result.send")}
        </Button>
      )}
    </form>
  );
}

/** The API's limit on a result's comment. */
const MAX_COMMENT_LENGTH = 2000;
