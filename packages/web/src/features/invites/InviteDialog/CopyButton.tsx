import { Check, Copy } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

type Props = {
  text: string;
  label: string;
};

/**
 * Copies a link or list; where the browser refuses the clipboard, shows the text selected instead,
 * since the links are never shown again.
 */
export function CopyButton({ text, label }: Props) {
  const { copied, copyFailed, copy } = useCopyToClipboard();
  if (copyFailed) {
    return (
      <textarea
        readOnly
        value={text}
        aria-label={t("invites.links.copyByHand")}
        rows={Math.min(text.split("\n").length, 4)}
        onFocus={(event) => event.currentTarget.select()}
        ref={(element) => element?.select()}
        className="w-full basis-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs"
      />
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void copy(text)}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t("invites.links.copied") : label}
    </Button>
  );
}
