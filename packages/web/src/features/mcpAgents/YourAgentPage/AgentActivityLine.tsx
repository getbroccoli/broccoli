import type { YourAgentActivityQuery } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

import { agentActivityLabel } from "../agentActivityLabel";
import { OutcomeBadge } from "./OutcomeBadge";
import { OUTCOME_LOOKS } from "./outcomeLooks";
import { timeAgo } from "./timeAgo";

type Props = {
  line: YourAgentActivityQuery["myAgentActivity"]["edges"][number]["node"];
};

/** One call of the person's agent: what it did, how Broccoli ended it, and when. */
export function AgentActivityLine({ line }: Props) {
  const { Icon, tile } = OUTCOME_LOOKS[line.outcome];
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
