import type { ReactNode } from "react";

import { FieldError } from "@/components/form";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props<V extends string> = {
  name: string;
  /** The choices in order; the last opens `picker`. */
  options: { value: V; label: string }[];
  selected: V;
  onSelect: (value: V) => void;
  /** What the choice means, under it. */
  hint: string;
  /** The date field shown while the last choice is selected. */
  picker: ReactNode;
  error?: string;
};

/** "Applies from" as one row of choices, such as "1 Jan 2026", "1 Jan 2027" and "Other date…". */
export function DateChoice<V extends string>({
  name,
  options,
  selected,
  onSelect,
  hint,
  picker,
  error,
}: Props<V>) {
  const other = options.at(-1)?.value;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-5">
      <span id={`${name}-label`} className="text-sm font-semibold">
        {t("terms.edit.appliesFrom")}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        className="flex flex-wrap gap-1 self-start rounded-lg bg-muted p-1"
      >
        {options.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === selected}
            onClick={() => onSelect(value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              value === selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {selected === other && <div className="flex max-w-64">{picker}</div>}
      <p className="text-[13px] text-muted-foreground">{hint}</p>
      <FieldError id={`${name}-error`} message={error} />
    </div>
  );
}
