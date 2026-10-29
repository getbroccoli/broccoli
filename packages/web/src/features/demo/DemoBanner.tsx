import { Info } from "@phosphor-icons/react";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { demoDaysLeft } from "./demoDaysLeft";
import { ExitDemoDialog } from "./ExitDemoDialog";
import { useDemoPresent } from "./useDemoPresent";

/**
 * Says the instance is in the demo, with the action that exits it; nothing otherwise. The
 * self-hosted demo also counts down the days its owner can still sign in.
 */
export function DemoBanner() {
  const { demoExpiresAt, me } = useRouteContext({ from: "/_authenticated" });
  // A failed query shows nothing here: the page below reports its own errors.
  const demoPresent = useDemoPresent();
  const [exiting, setExiting] = useState(false);

  if (!demoPresent) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-[12.5px] text-brand-deep">
      <Info aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{bannerText(demoExpiresAt)}</p>
      {me.operations.includes("RESET_WORKSPACE") && (
        <Button size="sm" onClick={() => setExiting(true)}>
          {t("demo.exit.open")}
        </Button>
      )}
      <ExitDemoDialog open={exiting} onOpenChange={setExiting} />
    </div>
  );
}

function bannerText(demoExpiresAt: string | null): string {
  if (!demoExpiresAt) return t("demo.banner.text");
  const daysLeft = demoDaysLeft(demoExpiresAt, new Date());
  return daysLeft > 1
    ? t("demo.banner.daysLeft", { days: String(daysLeft) })
    : t("demo.banner.lastDay");
}
