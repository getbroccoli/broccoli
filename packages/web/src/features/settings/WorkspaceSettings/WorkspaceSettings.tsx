import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useDemoPresent } from "@/features/demo";
import { ResetSetupDialog } from "@/features/setup";
import { t } from "@/i18n";

/** The Settings page's Workspace section: its danger zone, where the owner resets setup. */
export function WorkspaceSettings() {
  const demoPresent = useDemoPresent();
  const [resetting, setResetting] = useState(false);

  return (
    <section aria-labelledby="workspace-settings-title" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="workspace-settings-title" className="text-lg font-semibold">
          {t("settings.workspace.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.workspace.description")}</p>
      </div>
      <section
        aria-labelledby="danger-zone-title"
        className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4"
      >
        <h3 id="danger-zone-title" className="text-sm font-semibold text-destructive">
          {t("settings.workspace.dangerZone")}
        </h3>
        {/* The demo's owner exits the demo from the workspace menu instead. */}
        {demoPresent === false && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex max-w-[48ch] flex-col gap-0.5">
              <p className="text-sm font-medium">{t("setup.reset.open")}</p>
              <p className="text-sm text-muted-foreground">{t("setup.reset.detail")}</p>
            </div>
            <Button variant="destructive" onClick={() => setResetting(true)}>
              {t("setup.reset.open")}
            </Button>
          </div>
        )}
        {demoPresent && <p className="text-sm">{t("settings.workspace.inDemo")}</p>}
      </section>
      <ResetSetupDialog open={resetting} onOpenChange={setResetting} />
    </section>
  );
}
