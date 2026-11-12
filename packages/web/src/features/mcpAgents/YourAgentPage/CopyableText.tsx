import { Check, Copy } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

type Props = {
  text: string;
  /** The copy button's accessible name, such as "Copy command". */
  copyLabel?: string;
};

/** Text to paste elsewhere, with Copy; where the browser refuses the clipboard, the text is selected instead. */
export function CopyableText({ text, copyLabel }: Props) {
  const { copied, copyFailed, copy } = useCopyToClipboard();
  return (
    <div className="flex min-w-0 gap-2">
      {copyFailed ? (
        <input
          readOnly
          value={text}
          aria-label={t("mcpAgents.address.copyByHand")}
          ref={(element) => element?.select()}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border bg-app-backdrop px-3 font-mono text-[12.5px]"
        />
      ) : (
        <code className="flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-lg border bg-app-backdrop px-3 text-[12.5px] text-ellipsis whitespace-nowrap">
          {text}
        </code>
      )}
      <Button className="h-10 shrink-0" aria-label={copyLabel} onClick={() => void copy(text)}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("mcpAgents.address.copied") : t("mcpAgents.address.copy")}
      </Button>
    </div>
  );
}
