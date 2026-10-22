import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { CaretDown, TerminalWindow } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  ExternalAgentPill_ExternalAgentFragmentDoc,
  type ExternalAgentPill_ExternalAgentFragment,
  DisconnectExternalAgentDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

import { ClaudeMark } from "./ClaudeMark";
import { CodexMark } from "./CodexMark";

type Props = { externalAgent: FragmentType<ExternalAgentPill_ExternalAgentFragment> };

/**
 * The connected agent beside the files: a known agent by its name and mark, any other by the name
 * it reports, with Disconnect in its menu. Owns `ExternalAgentPill_externalAgent`.
 */
export function ExternalAgentPill({ externalAgent: externalAgentRef }: Props) {
  const { data: externalAgent, complete } = useFragment({
    fragment: ExternalAgentPill_ExternalAgentFragmentDoc,
    from: externalAgentRef,
  });
  const [disconnectExternalAgent, disconnecting] = usePayloadMutation(
    DisconnectExternalAgentDocument,
  );
  if (!complete) return null;
  const known = KNOWN_EXTERNAL_AGENTS[externalAgent.client.toLowerCase()];
  const failed = disconnecting.error || disconnecting.payloadError;
  return (
    <div className="flex items-center gap-3">
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          {t("externalAgents.disconnectFailed")}
        </p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={disconnecting.loading}
              className="flex h-7 items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft/40 pr-2 pl-2.5 text-xs text-brand-deep"
            />
          }
        >
          <span
            aria-hidden
            className="relative flex size-[18px] items-center justify-center rounded-[5px] border border-brand/25 bg-card"
          >
            {known ? known.mark : <TerminalWindow size={11} />}
            <span className="absolute -right-[3px] -bottom-[3px] size-[7px] rounded-full border-[1.5px] border-card bg-brand" />
          </span>
          <span>
            {t("externalAgents.connected", { client: known?.name ?? externalAgent.client })}
          </span>
          <CaretDown size={12} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 p-1.5">
          <DropdownMenuItem
            className="h-9 px-2.5"
            variant="destructive"
            onClick={() => void disconnectExternalAgent().catch(() => {})}
          >
            {t("externalAgents.disconnect")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Agents shown by their product name and a mark, by the name they report when connecting. */
const KNOWN_EXTERNAL_AGENTS: Record<string, { name: string; mark: ReactNode }> = {
  "claude-code": { name: "Claude Code", mark: <ClaudeMark size={12} /> },
  "claude code": { name: "Claude Code", mark: <ClaudeMark size={12} /> },
  codex: { name: "Codex", mark: <CodexMark size={12} /> },
};
