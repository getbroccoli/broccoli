import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  /** What the owner pastes into their agent; null while it is being made. */
  prompt: string | null;
};

/** A prompt for the owner to paste into their external agent, on a dark block, with Copy. */
export function ExternalAgentPromptBlock({ prompt }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const isCopied = prompt !== null && copied === prompt;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-foreground py-3 pr-3 pl-5 text-background">
      <code
        aria-busy={prompt === null}
        className="min-h-6 flex-1 py-2 font-mono text-[13px] leading-relaxed break-all"
      >
        {prompt ?? t("externalAgents.creating")}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        // Light on the dark block in either theme, unlike outline's translucent dark background.
        className="shrink-0 rounded-xl border-background bg-background text-foreground hover:bg-muted dark:border-background dark:bg-background dark:hover:bg-muted"
        disabled={prompt === null}
        aria-label={t(isCopied ? "externalAgents.copied" : "externalAgents.copy")}
        onClick={() =>
          prompt &&
          void navigator.clipboard.writeText(prompt).then(
            () => setCopied(prompt),
            () => setCopied(null),
          )
        }
      >
        {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}
