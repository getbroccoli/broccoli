import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { costSentence, refusalMessage } from "../timeOffText";
import { BalanceStrip } from "./BalanceStrip";
import type { BookingDraft } from "./useBookingDraft";

type Props = {
  draft: BookingDraft;
  firstName: string;
  typeName: string | null;
  window: { from: string; until: string };
  onToggleDays: () => void;
  onOpenBooking: (timeOffId: string, date: string) => void;
};

/** The cost line, then the refusal, the balance strip, or why the type has no balance. */
export function BookingSummary({
  draft,
  firstName,
  typeName,
  window,
  onToggleDays,
  onOpenBooking,
}: Props) {
  const preview = draft.preview!;
  const refusal = preview.refusal;
  return (
    <div className="flex flex-col gap-3">
      {preview.days.length > 0 && (
        <p className="text-[15px] font-medium">
          <button
            type="button"
            onClick={onToggleDays}
            className="text-left underline decoration-dotted underline-offset-4"
          >
            {costSentence(preview)}
          </button>
        </p>
      )}
      {refusal ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          {refusalMessage(refusal, { firstName, typeName, window })}
          {refusal.clashingTimeOffId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenBooking(refusal.clashingTimeOffId!, refusal.date!)}
            >
              {t("timeOff.dialog.openBooking")}
            </Button>
          )}
        </div>
      ) : preview.balances.length > 0 ? (
        <BalanceStrip draft={draft} firstName={firstName} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("timeOff.dialog.noBalance", { type: typeName ?? "" })}
        </p>
      )}
    </div>
  );
}
