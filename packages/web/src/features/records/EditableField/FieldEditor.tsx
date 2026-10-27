import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

import type { FieldEditorProps } from "../recordDescription";

/** The editor a record field uses: a text input, a date picker that closes on a pick, or its own. */
export function FieldEditor(props: FieldEditorProps) {
  const { field, value, invalid, describedBy, onChange, onDone, onRevert } = props;
  if (typeof field.editor === "function") {
    const OwnEditor = field.editor;
    return <OwnEditor {...props} />;
  }
  if (field.editor === "date") {
    return (
      <div
        onKeyDown={(event) => {
          // Only on the picker's button; the calendar, in a portal, closes itself on Escape.
          if (event.key !== "Escape" || !event.currentTarget.contains(event.target as Node)) return;
          event.stopPropagation();
          onRevert();
        }}
      >
        <DatePicker
          value={value}
          onChange={(next) => {
            onChange(next);
            onDone();
          }}
          placeholder={t("records.field.empty")}
          autoFocus
          aria-label={field.label}
          aria-invalid={invalid}
        />
      </div>
    );
  }
  return (
    <Input
      value={value}
      autoFocus
      aria-label={field.label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone();
        if (event.key === "Escape") {
          // Escape reverts this field only; it must not also close the panel.
          event.stopPropagation();
          onRevert();
        }
      }}
    />
  );
}
