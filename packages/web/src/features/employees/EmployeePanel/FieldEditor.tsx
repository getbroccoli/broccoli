import type { RecordField } from "@/features/records";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

type Props = {
  field: RecordField;
  value: string;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: string) => void;
  /** The person finished with the field; its value stays in the draft. */
  onDone: () => void;
  /** Escape: the field goes back to its saved value. */
  onRevert: () => void;
};

/** The editor a record field uses: a text input, or a date picker that closes on a pick. */
export function FieldEditor({
  field,
  value,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: Props) {
  if (field.editor === "date") {
    return (
      <DatePicker
        value={value}
        onChange={(next) => {
          onChange(next);
          onDone();
        }}
        placeholder={t("people.panel.empty")}
        autoFocus
        aria-label={field.label}
        aria-invalid={invalid}
      />
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
