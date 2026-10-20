import type { AgentStatus_AiFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatTime } from "@/lib/formatDate";

type Props = {
  agent: NonNullable<AgentStatus_AiFragment["agent"]>;
  disconnecting: boolean;
  onDisconnect: () => void;
};

/** The connected agent: who it says it is, how it works, its last call, and Disconnect. */
export function AgentConnectionRow({ agent, disconnecting, onDisconnect }: Props) {
  const details = [
    t(
      agent.way === "ANSWERS_MASKED_QUESTIONS"
        ? "externalAgents.connectedMasked"
        : "externalAgents.connectedParsed",
    ),
    agent.lastCallAt
      ? t("externalAgents.lastCall", { time: formatTime(agent.lastCallAt) })
      : t("externalAgents.noCallYet"),
    t("externalAgents.endsAt", { time: formatTime(agent.expiresAt) }),
  ];
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-3">
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-brand" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">
          {t("externalAgents.connected", { client: agent.client })}
        </span>
        <span className="text-[13px] text-muted-foreground">{details.join(" · ")}</span>
      </span>
      <Button type="button" variant="outline" disabled={disconnecting} onClick={onDisconnect}>
        {t(disconnecting ? "externalAgents.disconnecting" : "externalAgents.disconnect")}
      </Button>
    </div>
  );
}
