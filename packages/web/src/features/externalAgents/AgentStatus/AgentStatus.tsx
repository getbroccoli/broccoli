import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { Link } from "@tanstack/react-router";

import {
  AgentStatus_AiFragmentDoc,
  type AgentStatus_AiFragment,
  DisconnectAgentDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";
import { formatTime } from "@/lib/formatDate";

import { AgentConnectionRow } from "./AgentConnectionRow";

type Props = { ai: FragmentType<AgentStatus_AiFragment> };

/**
 * The owner's agent on the import step: connected with Disconnect, waiting for its prompt's code,
 * or neither, with a way back to Setup AI for a new prompt. Owns `AgentStatus_ai`.
 */
export function AgentStatus({ ai: aiRef }: Props) {
  const { data: ai, complete } = useFragment({ fragment: AgentStatus_AiFragmentDoc, from: aiRef });
  const [disconnectAgent, disconnecting] = usePayloadMutation(DisconnectAgentDocument);
  if (!complete) return null;
  return (
    <section aria-label={t("externalAgents.title")} className="flex flex-col gap-2">
      {ai.agent ? (
        <AgentConnectionRow
          agent={ai.agent}
          disconnecting={disconnecting.loading}
          onDisconnect={() => void disconnectAgent().catch(() => {})}
        />
      ) : (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-2 rounded-xl border border-border px-4 py-3 text-sm"
        >
          <span aria-hidden className="size-2.5 rounded-full bg-amber-500" />
          <span className="font-medium">
            {t(ai.agentCode ? "externalAgents.waitingShort" : "externalAgents.notConnected")}
          </span>
          {ai.agentCode && (
            <span className="text-muted-foreground">
              {t("externalAgents.codeExpires", { time: formatTime(ai.agentCode.expiresAt) })}
            </span>
          )}
        </p>
      )}
      <Link to="/setup/ai" className="w-fit text-[13px] font-medium underline underline-offset-2">
        {t("externalAgents.newPrompt")}
      </Link>
      {disconnecting.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("externalAgents.failed")}
        </p>
      )}
    </section>
  );
}
