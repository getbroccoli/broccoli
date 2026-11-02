import type { ComponentProps } from "react";

import { cn } from "@/lib/class-names";

import { FieldValue } from "./FieldValue";

type Props = ComponentProps<typeof FieldValue>;

/**
 * One field of a record's panel: its label and its value, edited in place. An edited field keeps
 * a mark until the panel saves or cancels.
 */
export function EditableField(props: Props) {
  const { field, saved, draft, error } = props;
  const changed = draft !== undefined && (draft || null) !== saved;

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
      <FieldValue {...props} />
    </div>
  );
}
