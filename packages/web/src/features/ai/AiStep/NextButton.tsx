import { ArrowRight } from "@phosphor-icons/react";

import type { AiSource } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  /** The source being checked, or null when none is. */
  checking: AiSource | null;
  disabled: boolean;
};

export function NextButton({ checking, disabled }: Props) {
  return (
    <Button type="submit" size="lg" className="h-10 gap-2 px-4" disabled={disabled}>
      {t(label(checking))}
      <ArrowRight weight="bold" aria-hidden />
    </Button>
  );
}

function label(checking: AiSource | null) {
  if (checking === null) {
    return "setup.ai.next";
  }
  return checking === "OPENROUTER" ? "setup.ai.checkingKey" : "setup.ai.connecting";
}
