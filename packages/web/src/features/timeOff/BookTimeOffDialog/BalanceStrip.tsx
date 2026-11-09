import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { balanceLines } from "../timeOffText";
import { BalanceFigure } from "./BalanceFigure";
import type { BookingDraft } from "./useBookingDraft";

type Props = { draft: BookingDraft; firstName: string };

/** Free now and free after, a line per leave year; amber when it goes below zero. */
export function BalanceStrip({ draft, firstName }: Props) {
  const lines = balanceLines(draft.preview?.balances ?? [], firstName);
  return lines.map((line) => (
    <div
      key={line.label ?? "only"}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl px-4 py-3",
        line.over ? "bg-[oklch(0.96_0.04_85)]" : "bg-brand/10",
      )}
    >
      {line.label && <span className="text-sm font-medium">{line.label}</span>}
      {line.unlimited ?? (
        <>
          <BalanceFigure value={line.before!} label={t("timeOff.dialog.freeNow")} />
          <span aria-hidden className="text-muted-foreground">
            →
          </span>
          <BalanceFigure value={line.after!} label={t("timeOff.dialog.freeAfter")} />
          {line.over && (
            <span className="ml-auto max-w-56 text-right text-xs text-[oklch(0.42_0.09_75)]">
              {line.over}
            </span>
          )}
        </>
      )}
    </div>
  ));
}
