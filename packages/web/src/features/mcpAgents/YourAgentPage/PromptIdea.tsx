import { Check, Copy } from "@phosphor-icons/react";

import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

/** One prompt to try, with Copy; the text stays selectable where the browser refuses the clipboard. */
export function PromptIdea({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <li className="flex min-h-24 flex-col justify-between gap-3 rounded-2xl border p-4 transition-shadow hover:border-brand/40 hover:shadow-md">
      <p className="text-sm leading-relaxed">“{text}”</p>
      <button
        type="button"
        aria-label={t("mcpAgents.prompts.copy", { prompt: text })}
        onClick={() => void copy(text)}
        className="flex min-h-11 items-center gap-1.5 self-start text-xs font-semibold text-muted-foreground hover:text-brand-deep sm:min-h-6"
      >
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? t("mcpAgents.address.copied") : t("mcpAgents.address.copy")}
      </button>
    </li>
  );
}
