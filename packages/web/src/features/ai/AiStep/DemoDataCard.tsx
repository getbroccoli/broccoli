import { UsersThree } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  disabled: boolean;
  /** People are already gathered: the demo is off, and the card says why. */
  unavailable: boolean;
  starting: boolean;
  onUse: () => void;
};

/** Demo data in place of the owner's people; it needs no AI. */
export function DemoDataCard({ disabled, unavailable, starting, onUse }: Props) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-4 py-3.5">
      <UsersThree size={20} aria-hidden className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-medium">{t("setup.ai.demo")}</span>
        <span id="demo-data-hint" className="text-sm text-muted-foreground">
          {t(unavailable ? "setup.import.demoUnavailable" : "setup.ai.demoHint")}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || unavailable}
        aria-describedby="demo-data-hint"
        onClick={onUse}
      >
        {t(starting ? "setup.import.demoStarting" : "setup.import.demo")}
      </Button>
    </div>
  );
}
