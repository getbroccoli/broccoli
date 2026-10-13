import { useQuery } from "@apollo/client/react";
import { Info } from "@phosphor-icons/react";

import { DemoDataDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { ClearDemoDataDialog } from "./ClearDemoDataDialog";

/** Says the instance holds demo data, with the action that clears it; nothing otherwise. */
export function DemoBanner() {
  // A failed query shows nothing here: the page below reports its own errors.
  const { data } = useQuery(DemoDataDocument);
  if (!data?.demo.isPresent) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-[12.5px] text-foreground">
      <Info aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">{t("demo.banner.text")}</p>
      <ClearDemoDataDialog />
    </div>
  );
}
