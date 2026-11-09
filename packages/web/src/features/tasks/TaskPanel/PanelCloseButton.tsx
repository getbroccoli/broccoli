import { X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { t } from "@/i18n";

/** Closes the task panel. */
export function PanelCloseButton() {
  return (
    <SheetClose render={<Button variant="ghost" size="icon" aria-label={t("tasks.panel.close")} />}>
      <X />
    </SheetClose>
  );
}
