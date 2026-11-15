import { Check, Copy } from "@phosphor-icons/react";

import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

/** One prompt to try, as a chip that copies it; the text stays selectable where the browser refuses the clipboard. */
export function PromptIdea({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <li>
      <button
        type="button"
        aria-label={t("mcpAgents.prompts.copy", { prompt: text })}
        onClick={() => void copy(text)}
        className="flex min-h-11 items-center gap-1.5 rounded-full border bg-background px-3 text-left text-xs text-muted-foreground select-text hover:border-brand/40 hover:text-brand-deep sm:min-h-7"
      >
        <span>“{text}”</span>
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        <span className="font-semibold">
          {copied ? t("mcpAgents.address.copied") : t("mcpAgents.address.copy")}
        </span>
      </button>
    </li>
  );
}
