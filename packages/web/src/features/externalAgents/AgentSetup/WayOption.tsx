import type { AgentWay } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

type Props = {
  value: AgentWay;
  selected: AgentWay;
  onSelect: (way: AgentWay) => void;
  title: string;
  hint: string;
  badge?: string;
};

/** One way the agent may work, as a card holding its radio button. */
export function WayOption({ value, selected, onSelect, title, hint, badge }: Props) {
  const isSelected = value === selected;
  const id = `agent-way-${value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors",
        isSelected ? "border-foreground ring-1 ring-foreground" : "border-border",
      )}
    >
      <input
        id={id}
        type="radio"
        name="agent-way"
        value={value}
        checked={isSelected}
        onChange={() => onSelect(value)}
        className="mt-0.5 size-4 shrink-0 accent-foreground"
      />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-deep">
              {badge}
            </span>
          )}
        </span>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
