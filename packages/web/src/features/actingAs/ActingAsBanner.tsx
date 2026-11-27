import { UserSwitch } from "@phosphor-icons/react";
import { useRouteContext } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { stopActing } from "./actingAsApi";
import { useActingAsChange } from "./useActingAsChange";
import { useReloadWhenActingChanges } from "./useReloadWhenActingChanges";

/**
 * Across the top of every page while the session acts as another employee: whom, and the way
 * back; nothing otherwise. Outside the page's scroll, so it never leaves the screen. Every page
 * reloads when another tab starts or stops acting.
 */
export function ActingAsBanner() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const { change: stop, pending, failed } = useActingAsChange(stopActing);
  useReloadWhenActingChanges();

  if (!me.actingAs) return null;
  const name = `${me.actingAs.firstName} ${me.actingAs.lastName}`;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-primary px-4 py-1.5 text-[12.5px] text-primary-foreground"
    >
      <UserSwitch aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 truncate font-medium">{t("actingAs.banner", { name })}</p>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => stop()}>
        {t("actingAs.stop")}
      </Button>
      {failed && <p role="alert">{t("actingAs.stopFailed")}</p>}
    </div>
  );
}
