import { useEffect, useState } from "react";

const COPIED_FEEDBACK_MS = 2000;

/** Copies text to the clipboard and reports "copied" for a moment, or a failure. */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  function resetCopy() {
    setCopied(false);
    setCopyFailed(false);
  }

  return { copied, copyFailed, copy, resetCopy };
}
