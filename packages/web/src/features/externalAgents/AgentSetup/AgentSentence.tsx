import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  /** The one-time code; null while it is being made. */
  code: string | null;
};

/** The sentence the owner pastes into their agent, with its one-time code, and Copy. */
export function AgentSentence({ code }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const sentence = code && t("externalAgents.sentence", { origin: window.location.origin, code });
  const isCopied = sentence !== null && copied === sentence;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-foreground py-3 pr-3 pl-5 text-background">
      <code
        aria-busy={sentence === null}
        className="min-h-6 flex-1 py-2 font-mono text-[13px] leading-relaxed break-all"
      >
        {sentence ?? t("externalAgents.creating")}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        // Light on the dark block in either theme, unlike outline's translucent dark background.
        className="shrink-0 rounded-xl border-background bg-background text-foreground hover:bg-muted dark:border-background dark:bg-background dark:hover:bg-muted"
        disabled={sentence === null}
        aria-label={t(isCopied ? "externalAgents.copied" : "externalAgents.copy")}
        onClick={() =>
          sentence &&
          void navigator.clipboard.writeText(sentence).then(
            () => setCopied(sentence),
            () => setCopied(null),
          )
        }
      >
        {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}
