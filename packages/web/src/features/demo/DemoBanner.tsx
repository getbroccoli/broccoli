import { useQuery } from "@apollo/client/react";
import { Info } from "@phosphor-icons/react";
import { Link, useRouteContext } from "@tanstack/react-router";

import { DemoDataDocument } from "@/__generated__/graphql";
import { buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";

import { ClearDemoDataDialog } from "./ClearDemoDataDialog";
import { demoDaysLeft } from "./demoDaysLeft";

/**
 * Says the instance holds demo data, with the action that clears it; nothing otherwise.
 * While the demo's owner has no account, it asks them to create one before the demo ends.
 */
export function DemoBanner() {
  const { demoExpiresAt } = useRouteContext({ from: "/_authenticated" });
  // A failed query shows nothing here: the page below reports its own errors.
  const { data } = useQuery(DemoDataDocument, { skip: demoExpiresAt !== null });

  if (demoExpiresAt) {
    const daysLeft = demoDaysLeft(demoExpiresAt, new Date());
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-[12.5px] text-brand-deep">
        <Info aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {daysLeft > 1
            ? t("demo.banner.accountWithin", { days: String(daysLeft) })
            : t("demo.banner.accountToday")}
        </p>
        <Link to="/account" className={buttonVariants({ size: "sm" })}>
          {t("demo.banner.createAccount")}
        </Link>
      </div>
    );
  }
  if (!data?.demo.isPresent) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-[12.5px] text-foreground">
      <Info aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">{t("demo.banner.text")}</p>
      <ClearDemoDataDialog />
    </div>
  );
}
