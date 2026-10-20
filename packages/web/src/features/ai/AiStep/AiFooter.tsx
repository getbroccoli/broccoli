import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import type { AiSource } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props = {
  /** The source being checked, or null when none is. */
  checking: AiSource | null;
  disabled: boolean;
  busy: boolean;
};

export function AiFooter({ checking, disabled, busy }: Props) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <Link
        to="/setup/company"
        className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-10 gap-2 px-3")}
        disabled={busy}
        aria-disabled={busy}
      >
        <ArrowLeft aria-hidden />
        {t("setup.back")}
      </Link>
      <Button type="submit" size="lg" className="h-10 gap-2 px-4" disabled={disabled}>
        {t(label(checking))}
        <ArrowRight weight="bold" aria-hidden />
      </Button>
    </div>
  );
}

function label(checking: AiSource | null) {
  if (checking === null) {
    return "setup.ai.next";
  }
  return checking === "OPENROUTER" ? "setup.ai.checkingKey" : "setup.ai.connecting";
}
