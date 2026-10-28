import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  count: number;
  /** The actions on the selected rows, such as an Invite button. */
  actions: ReactNode;
  onClear: () => void;
};

/** Replaces a table's toolbar while rows are selected: how many, what to do with them, and Clear. */
export function BulkBar({ count, actions, onClear }: Props) {
  return (
    <>
      <span className="text-[12.5px] font-semibold text-foreground" aria-live="polite">
        {t("table.selected", { count: String(count) })}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {actions}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground"
        >
          {t("table.clearSelection")}
        </Button>
      </div>
    </>
  );
}
