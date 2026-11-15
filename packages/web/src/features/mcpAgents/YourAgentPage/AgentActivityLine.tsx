import { Check, type Icon, Prohibit, WarningCircle } from "@phosphor-icons/react";

import type { AgentActivityOutcome, YourAgentActivityQuery } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";
import { type MessageKey, t } from "@/i18n";

import { agentActivityLabel } from "../agentActivityLabel";
import { timeAgo } from "./timeAgo";

type Props = {
  line: YourAgentActivityQuery["myAgentActivity"]["edges"][number]["node"];
};

/** One call of the person's agent: what it did, how Broccoli ended it, and when. */
export function AgentActivityLine({ line }: Props) {
  const { Icon, tile } = LOOKS[line.outcome];
  return (
    <li className="agent-activity-line flex items-center gap-3 px-4 py-2.5">
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", tile)}>
        <Icon size={14} weight="bold" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-sm">{agentActivityLabel(line)}</span>
      <OutcomeBadge outcome={line.outcome} />
      <span className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {timeAgo(line.calledAt)}
      </span>
    </li>
  );
}

/** "Refused" or "Didn’t work" for a call Broccoli did not answer; nothing for an answered one. */
export function OutcomeBadge({ outcome }: { outcome: AgentActivityOutcome }) {
  const { tile, badge } = LOOKS[outcome];
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

const LOOKS = {
  ANSWERED_BY_BROCCOLI: {
    Icon: Check,
    tile: "bg-brand-soft text-brand-deep",
    badge: null,
  },
  REFUSED_BY_BROCCOLI: {
    Icon: Prohibit,
    tile: "bg-muted text-foreground",
    badge: "mcpAgents.activity.refused",
  },
  FAILED_IN_BROCCOLI: {
    Icon: WarningCircle,
    tile: "bg-amber-50 text-amber-800",
    badge: "mcpAgents.activity.failed",
  },
} satisfies Record<AgentActivityOutcome, Look>;

type Look = { Icon: Icon; tile: string; badge: MessageKey | null };
