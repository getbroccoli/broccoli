import { Info } from "@phosphor-icons/react";

import { t } from "@/i18n";

const SETUP_GUIDE_URL =
  "https://github.com/getbroccoli/broccoli/blob/main/docs/guides/setup-guide.md";

/** On a self-hosted instance, agents keep working only at the address they connected to. */
export function SelfHostedNote() {
  return (
    <div role="note" className="flex gap-3 rounded-xl bg-app-backdrop px-4 py-3 text-sm">
      <Info size={18} className="mt-0.5 shrink-0 text-brand-deep" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="font-medium">{t("mcpAgents.selfHosted.title")}</span>
        <span className="text-muted-foreground">
          {t("mcpAgents.selfHosted.detail")}{" "}
          <a
            href={SETUP_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            {t("mcpAgents.selfHosted.guide")}
          </a>
        </span>
      </div>
    </div>
  );
}
