import { useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = { code: string };

/** The sentence the owner pastes into their agent, with its one-time code, and Copy. */
export function AgentSentence({ code }: Props) {
  const [copied, setCopied] = useState(false);
  const sentence = t("externalAgents.sentence", { origin: window.location.origin, code });
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted px-3.5 py-3">
      <code className="flex-1 font-mono text-[13px] leading-relaxed break-all">{sentence}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() =>
          void navigator.clipboard.writeText(sentence).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {t(copied ? "externalAgents.copied" : "externalAgents.copy")}
      </Button>
    </div>
  );
}
