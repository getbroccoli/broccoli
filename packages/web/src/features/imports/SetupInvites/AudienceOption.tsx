import type { ReactNode } from "react";

import type { SetupInviteAudience } from "@/__generated__/graphql";

type Props = {
  value: SetupInviteAudience;
  chosen: SetupInviteAudience;
  onChoose: (audience: SetupInviteAudience) => void;
  title: string;
  detail: string;
  disabled?: boolean;
  children?: ReactNode;
};

/** One answer to "Who should use Broccoli?": who it includes and what they can do. */
export function AudienceOption({
  value,
  chosen,
  onChoose,
  title,
  detail,
  disabled,
  children,
}: Props) {
  const id = `audience-${value}`;
  return (
    <div className="flex gap-3 rounded-xl border px-4 py-3 has-checked:border-primary has-disabled:opacity-60">
      <input
        id={id}
        type="radio"
        name="audience"
        className="mt-1"
        checked={chosen === value}
        disabled={disabled}
        onChange={() => onChoose(value)}
        aria-describedby={`${id}-detail`}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {title}
        </label>
        <p id={`${id}-detail`} className="text-sm text-muted-foreground">
          {detail}
        </p>
        {children}
      </div>
    </div>
  );
}
