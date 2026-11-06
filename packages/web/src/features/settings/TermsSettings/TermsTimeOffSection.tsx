import type { ReactNode } from "react";

import { t } from "@/i18n";

import type { TimeOffRow } from "./termsQueries";
import { TimeOffRuleRow } from "./TimeOffRuleRow";

type Props = {
  termsName: string;
  timeOff: TimeOffRow[];
  /** The type whose rules are open, with its form and the line under its name. */
  open: { timeOffTypeId: string; editor: ReactNode; summary: string; dirty: boolean } | null;
  onEdit: (timeOffTypeId: string) => void;
  onCancelPlanned: (timeOffTypeId: string, version: TimeOffRow["versions"][number]) => void;
};

/** Each time off type's rules on the terms today, or "Not offered here", with planned rules under them. */
export function TermsTimeOffSection({ termsName, timeOff, open, onEdit, onCancelPlanned }: Props) {
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
            onCancelPlanned={(version) => onCancelPlanned(row.timeOffType.id, version)}
          />
        ))}
      </ul>
    </section>
  );
}
