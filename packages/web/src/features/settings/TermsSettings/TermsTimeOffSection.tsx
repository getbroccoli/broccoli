import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import type { TimeOffRow } from "./termsQueries";
import { TimeOffRuleRow } from "./TimeOffRuleRow";

type Props = {
  termsName: string;
  timeOff: TimeOffRow[];
  /** The type whose rules are open, with its form and the line under its name. */
  open: { timeOffTypeId: string; editor: ReactNode; summary: string; dirty: boolean } | null;
  onEdit: (timeOffTypeId: string) => void;
  onStop: (timeOffTypeId: string) => void;
  onCancelPlanned: (timeOffTypeId: string, version: TimeOffRow["versions"][number]) => void;
  onCancelStop: (timeOffTypeId: string, stopDate: string) => void;
  onAdd: () => void;
};

/**
 * Each time off type's rules on the terms today, or "Not offered here", with planned rules under
 * them, and adding a type.
 */
export function TermsTimeOffSection({
  termsName,
  timeOff,
  open,
  onEdit,
  onStop,
  onCancelPlanned,
  onCancelStop,
  onAdd,
}: Props) {
  return (
    <section aria-labelledby="terms-time-off" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="terms-time-off" className="text-[17px] font-semibold">
          {t("terms.timeOff.title")}
        </h3>
        <p className="text-[13px] text-muted-foreground">{t("terms.timeOff.description")}</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {timeOff.map((row) => (
          <TimeOffRuleRow
            key={row.timeOffType.id}
            row={row}
            termsName={termsName}
            open={open?.timeOffTypeId === row.timeOffType.id ? open : null}
            onEdit={() => onEdit(row.timeOffType.id)}
            onStop={() => onStop(row.timeOffType.id)}
            onCancelPlanned={(version) => onCancelPlanned(row.timeOffType.id, version)}
            onCancelStop={(stopDate) => onCancelStop(row.timeOffType.id, stopDate)}
          />
        ))}
      </ul>
      <Button variant="outline" size="sm" className="self-start" onClick={onAdd}>
        {t("terms.timeOff.add")}
      </Button>
    </section>
  );
}
