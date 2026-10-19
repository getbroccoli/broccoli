import type { ReactNode } from "react";

import type { AiSource } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

type Props = {
  value: AiSource;
  selected: AiSource;
  onSelect: (source: AiSource) => void;
  title: string;
  hint: string;
  /** Shown under the hint while this option is selected. */
  children?: ReactNode;
};

/** One way to read files, as a card holding its radio button. */
export function SourceOption({ value, selected, onSelect, title, hint, children }: Props) {
  const isSelected = value === selected;
  const id = `ai-source-${value}`;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3.5 transition-colors",
        isSelected ? "border-foreground ring-1 ring-foreground" : "border-border",
      )}
    >
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3.5">
        <input
          id={id}
          type="radio"
          name="source"
          value={value}
          checked={isSelected}
          onChange={() => onSelect(value)}
          className="size-4 shrink-0 accent-foreground"
        />
        <span className="flex flex-col">
          <span className="text-[15px] font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
      </label>
      {isSelected && children && <div className="mt-3 pl-[30px]">{children}</div>}
    </div>
  );
}
