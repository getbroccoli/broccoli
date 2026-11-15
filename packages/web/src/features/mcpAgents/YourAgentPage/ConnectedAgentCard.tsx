import { Robot } from "@phosphor-icons/react";
import { useState } from "react";

import type { YourAgentQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { AgentActivity } from "./AgentActivity";
import { dateAndTime } from "./dateAndTime";
import { AgentWelcome } from "./AgentWelcome";
import { DisconnectAgentDialog } from "./DisconnectAgentDialog";
import { timeAgo } from "./timeAgo";

/** How long after connecting the page congratulates the person. */
const WELCOME_MS = 60 * 60 * 1000;

type Props = {
  connection: NonNullable<YourAgentQuery["myAgentConnection"]>;
  /** When the page opened, in milliseconds; calls before it are history. */
  openedAt: number;
  /** Who the agent acts as: the person's name, or their email without an employee. */
  personName: string;
};

/** The person's connected agent with Disconnect, a welcome right after connecting, and what it is doing. */
export function ConnectedAgentCard({ connection, openedAt, personName }: Props) {
  const [confirming, setConfirming] = useState(false);
  // Decided once per visit, so the welcome stays put while the person reads it.
  const [welcoming, setWelcoming] = useState(
    () => Date.now() - new Date(connection.connectedAt).getTime() < WELCOME_MS,
  );
  const client = connection.clientName ?? t("mcpAgents.unnamedClient");
  return (
    <div className="flex flex-col gap-7">
      <section
        aria-label={t("mcpAgents.connected.label")}
        className="overflow-hidden rounded-2xl border"
      >
        {welcoming && <AgentWelcome client={client} onDismiss={() => setWelcoming(false)} />}
        <div className="flex flex-wrap items-center gap-3 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep">
            <Robot size={20} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-semibold">{client}</span>
              <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2 text-[11.5px] font-semibold text-brand-deep">
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                {t("mcpAgents.connected.badge")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {t("mcpAgents.connected.since", {
                name: personName,
                date: dateAndTime(connection.connectedAt),
                lastActive: timeAgo(connection.lastUsedAt),
              })}
            </span>
          </div>
          <Button
            variant="outline"
            className="max-sm:h-11 max-sm:w-full"
            onClick={() => setConfirming(true)}
          >
            {t("mcpAgents.disconnect.open")}
          </Button>
        </div>
      </section>
      <AgentActivity client={client} connectedAt={connection.connectedAt} openedAt={openedAt} />
      <DisconnectAgentDialog
        open={confirming}
        onOpenChange={setConfirming}
        connection={{ id: connection.id, client }}
      />
    </div>
  );
}
