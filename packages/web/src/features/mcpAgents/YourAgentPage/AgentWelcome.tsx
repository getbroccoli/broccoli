import { Sparkle, X } from "@phosphor-icons/react";

import { t } from "@/i18n";

type Props = { client: string; onDismiss: () => void };

/** Congratulates the person on an agent they connected a moment ago. */
export function AgentWelcome({ client, onDismiss }: Props) {
  return (
    <div
      role="status"
      className="flex items-center gap-4 border-b bg-linear-to-br from-brand-soft to-background p-5 motion-safe:animate-in motion-safe:fade-in"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-white">
        <Sparkle
          size={24}
          weight="fill"
          aria-hidden
          className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:spin-in-12 motion-safe:duration-500"
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-lg font-semibold">{t("mcpAgents.welcome.title", { client })}</span>
        <span className="text-sm text-brand-deep">{t("mcpAgents.welcome.detail")}</span>
      </div>
      <button
        type="button"
        aria-label={t("mcpAgents.welcome.dismiss")}
        onClick={onDismiss}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-brand-deep hover:bg-brand-soft"
      >
        <X size={14} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
