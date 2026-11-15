import type { AgentActivityOutcome } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";
import { t } from "@/i18n";

import { OUTCOME_LOOKS } from "./outcomeLooks";

type Props = {
  outcome: AgentActivityOutcome;
};

/** "Refused" or "Didn’t work" for a call Broccoli did not answer; nothing for an answered one. */
export function OutcomeBadge({ outcome }: Props) {
  const { tile, badge } = OUTCOME_LOOKS[outcome];
  return (
    badge && (
      <span
        className={cn(
          "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11.5px] font-semibold",
          tile,
        )}
      >
        {t(badge)}
      </span>
    )
  );
}
