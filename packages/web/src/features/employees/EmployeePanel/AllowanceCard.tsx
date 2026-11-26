import { CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { formatDayCount } from "@/lib/formatDays";

import { AdjustAllowanceDialog } from "./AdjustAllowanceDialog";
import { AllowanceHistory } from "./AllowanceHistory";
import { TimeOffFigure } from "./TimeOffFigure";
import { waitingLine } from "./timeOffRequestText";

type TimeOffType = NonNullable<EmployeePanel_EmployeeFragment["timeOffTypes"]>[number];

type Props = {
  employeeId: string;
  type: TimeOffType;
  /** The leave year as the section shows it, and whether this card names its own. */
  period: { label: string; shownOnCard: boolean };
  /** Set for who may adjust the balance: the person's first name and whether the reader is them. */
  adjustFor?: { firstName: string; isReader: boolean };
};

/** One balance's figures, its history on demand and, for who may, an adjustment. */
export function AllowanceCard({ employeeId, type, period, adjustFor }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const historyId = useId();
  const allowanceId = type.allowanceId;

  return (
    <section
      aria-label={type.timeOffType.name}
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-sidebar px-3 py-2">
        <h3 className="text-[13px] font-medium">
          {type.timeOffType.name}
          {period.shownOnCard && (
            <span className="ml-2 font-normal text-muted-foreground">{period.label}</span>
          )}
        </h3>
        {adjustFor && allowanceId && (
          <Button variant="ghost" size="sm" onClick={() => setAdjusting(true)}>
            {t("people.panel.timeOff.adjust.open")}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-3 px-3 py-2.5 sm:grid-cols-4">
        <TimeOffFigure
          label={t("people.panel.timeOff.entitlement")}
          value={formatDayCount(type.entitlement ?? 0)}
        />
        <TimeOffFigure
          label={t("people.panel.timeOff.bankHolidays")}
          value={formatDayCount(type.bankHolidays ?? 0)}
        />
        <TimeOffFigure label={t("people.panel.timeOff.used")} value={formatDayCount(type.used)} />
        <TimeOffFigure
          label={t("people.panel.timeOff.remaining")}
          value={formatDayCount(type.remaining ?? 0)}
          emphasis
        />
      </dl>
      {waitingLine(type.waiting) && (
        <p className="px-3 pb-2.5 text-[13px] text-amber-900">{waitingLine(type.waiting)}</p>
      )}
      {allowanceId && (
        <>
          <div className="px-1.5 pb-1.5">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={historyOpen}
              aria-controls={historyId}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              {t("people.panel.timeOff.history.show")}
              <CaretDown className={cn("transition-transform", historyOpen && "rotate-180")} />
            </Button>
          </div>
          <div id={historyId}>
            {historyOpen && <AllowanceHistory employeeId={employeeId} allowanceId={allowanceId} />}
          </div>
        </>
      )}
      {adjusting && adjustFor && allowanceId && (
        <AdjustAllowanceDialog
          allowanceId={allowanceId}
          person={adjustFor}
          typeName={type.timeOffType.name}
          period={period.label}
          remaining={type.remaining ?? 0}
          onClose={() => setAdjusting(false)}
        />
      )}
    </section>
  );
}
