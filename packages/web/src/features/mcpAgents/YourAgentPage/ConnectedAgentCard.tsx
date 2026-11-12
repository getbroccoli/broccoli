import { Check, Robot } from "@phosphor-icons/react";
import { useState } from "react";

import type { YourAgentQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import { DisconnectAgentDialog } from "./DisconnectAgentDialog";

const PROMISES: readonly MessageKey[] = [
  "mcpAgents.connected.reads",
  "mcpAgents.connected.neverApproves",
];

type Props = {
  connection: NonNullable<YourAgentQuery["myAgentConnection"]>;
  /** Who the agent acts as: the person's name, or their email without an employee. */
  personName: string;
  address: string;
};

/** The person's connected agent, what it may do, and Disconnect. */
export function ConnectedAgentCard({ connection, personName, address }: Props) {
  const [confirming, setConfirming] = useState(false);
  const client = connection.clientName ?? t("mcpAgents.unnamedClient");
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label={t("mcpAgents.connected.label")}
        className="flex flex-col gap-4 rounded-2xl border p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
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
                date: dateAndTimeOf(connection.connectedAt),
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
        <ul className="flex flex-col gap-2 border-t pt-4 text-sm">
          {[
            t("mcpAgents.connected.actsAs", { name: personName }),
            ...PROMISES.map((key) => t(key)),
          ].map((promise) => (
            <li key={promise} className="flex gap-2.5">
              <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden />
              {promise}
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">
        {t("mcpAgents.connected.replaces", { address, client })}
      </p>
      <DisconnectAgentDialog
        open={confirming}
        onOpenChange={setConfirming}
        connection={{ id: connection.id, client }}
      />
    </div>
  );
}

const dateAndTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function dateAndTimeOf(dateTime: string): string {
  return dateAndTime.format(new Date(dateTime));
}

const relativeTime = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** A past moment as "2 hours ago" or "yesterday", in the largest unit that fits. */
function timeAgo(dateTime: string): string {
  const seconds = Math.round((new Date(dateTime).getTime() - Date.now()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return relativeTime.format(0, "second");
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
