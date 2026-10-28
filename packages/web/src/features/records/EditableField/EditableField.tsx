import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { RecordField } from "../recordDescription";
import { FieldEditor } from "./FieldEditor";

type Props = {
  field: RecordField;
  recordId: string;
  saved: string | null;
  /** The unsaved value, or undefined when the field is unchanged. */
  draft: string | null | undefined;
  error: string | undefined;
  /** True while the panel saves: the draft being saved must not change. */
  disabled: boolean;
  /** The caller may not change this field: it shows its value only, with no pencil. */
  readOnly?: boolean;
  onEdit: (value: string) => void;
  onRevert: () => void;
};

/**
 * One field of a record's panel: its value, which a click or Enter turns into its editor. An
 * edited field keeps a mark until the panel saves or cancels.
 */
export function EditableField({
  field,
  recordId,
  saved,
  draft,
  error,
  disabled,
  readOnly = false,
  onEdit,
  onRevert,
}: Props) {
  const [editing, setEditing] = useState(false);
  const changed = draft !== undefined && (draft || null) !== saved;
  const value = draft ?? saved ?? "";
  const shown = value ? field.format(value) : t("records.field.empty");
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
        {readOnly ? (
          <span className={cn("block px-1.5 py-1 break-words", !value && "text-muted-foreground")}>
            {shown}
          </span>
        ) : (editing || error) && !disabled ? (
          <FieldEditor
            field={field}
            recordId={recordId}
            value={value}
            invalid={Boolean(error)}
            describedBy={error ? errorId : undefined}
            onChange={(value) => {
              // A refused field stays open while it is corrected, though typing clears its error.
              setEditing(true);
              onEdit(value);
            }}
            onDone={() => setEditing(false)}
            onRevert={() => {
              onRevert();
              setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            aria-label={`${t("records.field.edit", { field: field.label })}: ${shown}`}
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
        {error && (
          <p id={errorId} className="px-1.5 pt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
