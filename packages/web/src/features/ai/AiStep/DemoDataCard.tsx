import { UsersThree } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Demo data in place of the owner's people; it needs no AI. */
export function DemoDataCard({
  disabled,
  skipping,
  onUse,
}: {
  disabled: boolean;
  skipping: boolean;
  onUse: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-4 py-3.5">
      <UsersThree size={20} aria-hidden className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-medium">{t("setup.ai.demo")}</span>
        <span className="text-sm text-muted-foreground">{t("setup.ai.demoHint")}</span>
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={onUse}>
        {t(skipping ? "setup.import.skipping" : "setup.ai.useDemo")}
      </Button>
    </div>
  );
}
