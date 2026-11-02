import { Check, type Icon, X } from "@phosphor-icons/react";

import type { SetupInviteAudience } from "@/__generated__/graphql";

type Props = {
  value: SetupInviteAudience;
  chosen: SetupInviteAudience;
  onChoose: (audience: SetupInviteAudience) => void;
  icon: Icon;
  title: string;
  /** Who the answer lets in. */
  who: string;
  /** What they can do. */
  can: string[];
  /** What they can't. */
  cannot?: string;
  disabled?: boolean;
};

/** One answer to "Who uses Broccoli?", as a card: who it lets in and what they can do. */
export function AudienceOption({
  value,
  chosen,
  onChoose,
  icon: OptionIcon,
  title,
  who,
  can,
  cannot,
  disabled,
}: Props) {
  const id = `audience-${value}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-200 hover:border-muted-foreground/40 has-checked:border-foreground has-checked:shadow-[0_0_0_1px_var(--foreground)] has-disabled:cursor-not-allowed has-disabled:opacity-60 has-disabled:hover:border-border has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
    >
      <span className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <OptionIcon size={20} aria-hidden />
        </span>
        <input
          id={id}
          type="radio"
          name="audience"
          className="size-4 cursor-pointer appearance-none rounded-full border border-input outline-none checked:border-[5px] checked:border-foreground disabled:cursor-not-allowed"
          checked={chosen === value}
          disabled={disabled}
          onChange={() => onChoose(value)}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-who`}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span id={`${id}-title`} className="text-[17px] font-semibold">
          {title}
        </span>
        <span id={`${id}-who`} className="text-sm text-muted-foreground">
          {who}
        </span>
      </span>
      <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm leading-[1.45]">
        {can.map((line) => (
          <li key={line} className="flex gap-2">
            <Check
              size={15}
              weight="bold"
              className="mt-0.5 shrink-0 text-brand-deep"
              aria-hidden
            />
            {line}
          </li>
        ))}
        {cannot && (
          <li className="flex gap-2 text-muted-foreground">
            <X size={15} className="mt-0.5 shrink-0" aria-hidden />
            {cannot}
          </li>
        )}
      </ul>
    </label>
  );
}
