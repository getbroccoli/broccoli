import { useQuery } from "@apollo/client/react";
import { Robot, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AgentInvitationDocument, CloseAgentInvitationDocument } from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";

import { showAgentInvitationClosed } from "../cache";

type Props = {
  /** Shown instead once the invitation is closed or an agent is connected. */
  otherwise: ReactNode;
};

/**
 * Invites the person to connect their own agent, until they close it for good or connect one.
 * Shows nothing until the server has answered, so neither the card nor `otherwise` flashes.
 */
export function AgentInvitation({ otherwise }: Props) {
  // An agent connects or the card closes in another tab, so only this visit's answer counts.
  const { data, error } = useQuery(AgentInvitationDocument, { fetchPolicy: "network-only" });
  const cache = useCache();
  // A read that answered while the close was on its way may have reopened the card.
  const [closeInvitation] = usePayloadMutation(CloseAgentInvitationDocument, {
    update: (updated, { data: closed }) =>
      closed &&
      showAgentInvitationClosed(updated, closed.mcpAgents.closeInvitation.agentInvitationClosed),
  });

  if (error && !data) return otherwise;
  if (!data) return null;
  if (data.myAgentConnection || data.agentInvitationClosed) return otherwise;

  const close = async (button: HTMLButtonElement) => {
    // The button goes away, so keyboard and screen-reader users continue from the page's heading.
    button.closest("main")?.querySelector("h1")?.focus({ preventScroll: true });
    showAgentInvitationClosed(cache, true);
    try {
      await closeInvitation();
    } catch {
      showAgentInvitationClosed(cache, false);
      toast.error(t("mcpAgents.invitation.closeFailed"));
    }
  };

  return (
    <section
      aria-labelledby="agent-invitation-title"
      className="relative flex flex-col gap-4 rounded-2xl border border-brand/20 bg-linear-to-br from-brand-soft to-background p-5 motion-safe:animate-in motion-safe:fade-in sm:flex-row sm:items-center sm:pr-14"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-white">
        <Robot size={24} weight="fill" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="agent-invitation-title" className="text-lg font-semibold">
          {t("mcpAgents.invitation.title")}
        </h2>
        <p className="text-sm text-brand-deep">{t("mcpAgents.invitation.detail")}</p>
      </div>
      <Link to="/agent" className={buttonVariants({ size: "lg", className: "max-sm:w-full" })}>
        {t("mcpAgents.invitation.connect")}
      </Link>
      <button
        type="button"
        aria-label={t("mcpAgents.invitation.close")}
        onClick={(event) => void close(event.currentTarget)}
        className="absolute top-3 right-3 grid size-11 place-items-center rounded-lg text-brand-deep hover:bg-brand-soft"
      >
        <X size={16} weight="bold" aria-hidden />
      </button>
    </section>
  );
}
