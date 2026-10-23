import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";

import type { RecordField } from "@/features/records";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { FieldEditor } from "./FieldEditor";

type Props = {
  field: RecordField;
  saved: string | null;
  /** The unsaved value, or undefined when the field is unchanged. */
  draft: string | null | undefined;
  error: string | undefined;
  onEdit: (value: string) => void;
  onRevert: () => void;
};

/**
 * One field of a record's panel: its value, which a click or Enter turns into its editor. An
 * edited field keeps a mark and its saved value ("was …") until the panel saves or cancels.
 */
export function EditableField({ field, saved, draft, error, onEdit, onRevert }: Props) {
  const [editing, setEditing] = useState(false);
  const changed = draft !== undefined && (draft || null) !== saved;
  const value = draft ?? saved ?? "";
  const shown = value ? field.format(value) : t("people.panel.empty");
  const errorId = `${field.key}-error`;

  return (
    <div
      className={cn(
        "grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3 border-b border-border/60 px-3 py-2 text-[13px] last:border-b-0",
        (changed || error) && "border-l-2 bg-brand-soft/40 pl-2.5",
        changed && !error && "border-l-brand",
        error && "border-l-destructive",
      )}
    >
      <span className="text-muted-foreground">{field.label}</span>
      <div className="min-w-0">
        {editing || error ? (
          <FieldEditor
            field={field}
            value={value}
            invalid={Boolean(error)}
            describedBy={error ? errorId : undefined}
            onChange={onEdit}
            onDone={() => setEditing(false)}
            onRevert={() => {
              onRevert();
              setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            aria-label={`${t("people.panel.edit", { field: field.label })}: ${shown}`}
            onClick={() => setEditing(true)}
            className="group/field flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              className={cn(
                "min-w-0 flex-1 break-words",
                !value && "text-muted-foreground",
                changed && "font-medium",
              )}
            >
              {shown}
            </span>
            <PencilSimple
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/field:opacity-100 group-focus-visible/field:opacity-100"
            />
          </button>
        )}
        {changed && !error && (
          <p className="px-1.5 text-xs text-muted-foreground">
            {saved
              ? t("people.panel.was", { value: field.format(saved) })
              : t("people.panel.wasEmpty")}
          </p>
        )}
        {error && (
          <p id={errorId} className="px-1.5 pt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
