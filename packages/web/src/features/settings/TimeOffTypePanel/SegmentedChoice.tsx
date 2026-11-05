import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props<Value extends string> = {
  /** Names the group for screen readers. */
  label: string;
  /** Unique on the page, so each group's arrow keys stay within it. */
  name: string;
  options: readonly { value: Value; label: Parameters<typeof t>[0] }[];
  value: Value;
  disabled: boolean;
  onChange: (value: Value) => void;
};

/** One choice among a few, as native radios drawn as segments: one tab stop, arrow keys move. */
export function SegmentedChoice<Value extends string>({
  label,
  name,
  options,
  value,
  disabled,
  onChange,
}: Props<Value>) {
  return (
    <fieldset className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            option.value === value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {t(option.label)}
        </label>
      ))}
    </fieldset>
  );
}
