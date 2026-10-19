import { Check } from "@phosphor-icons/react";

import type { AiKeyOrigin } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** The key OpenRouter is already used with; Replace asks for another. */
export function KnownKey({ origin, onReplace }: { origin: AiKeyOrigin; onReplace: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-sm text-brand-deep">
        <Check size={14} weight="bold" aria-hidden />
        {t(origin === "ENVIRONMENT" ? "setup.ai.keyFound" : "setup.ai.keySaved")}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onReplace}>
        {t("setup.ai.replace")}
      </Button>
    </div>
  );
}
