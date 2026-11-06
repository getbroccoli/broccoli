import { CalendarBlank } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { TimeOffTypeIcon } from "../TimeOffSettings";
import type { TimeOffRow } from "./termsQueries";
import { companyToday, plannedLine, ruleLine, splitVersions } from "./termsText";

type Props = {
  row: TimeOffRow;
  termsName: string;
  /** The open form with the line under the name; null while the row is closed. */
  open: { editor: ReactNode; summary: string; dirty: boolean } | null;
  onEdit: () => void;
  onCancelPlanned: (version: TimeOffRow["versions"][number]) => void;
};

/** One time off type on the terms: its rules today or "Not offered here", planned rules, or its form. */
export function TimeOffRuleRow({ row, termsName, open, onEdit, onCancelPlanned }: Props) {
  const { timeOffType } = row;
  const { current, planned } = splitVersions(row.versions, companyToday());
  return (
    <li
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-3.5",
        open ? "border-foreground" : "border-border",
        !current && !open && "border-dashed",
      )}
    >
      <div className="flex items-start gap-3">
        <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold [overflow-wrap:anywhere]">{timeOffType.name}</p>
          <p className="text-[13px] text-muted-foreground">
            {open?.summary ??
              (current ? ruleLine(current) : t("terms.timeOff.notOffered", { terms: termsName }))}
          </p>
          {!open &&
            planned.map((version) => (
              <div
                key={version.id}
                className="mt-1.5 flex items-center gap-2 text-[13px] text-muted-foreground"
              >
                <CalendarBlank aria-hidden className="shrink-0" />
                <span className="flex-1">{plannedLine(version)}</span>
                <Button variant="ghost" size="sm" onClick={() => onCancelPlanned(version)}>
                  {t("terms.edit.cancelChange")}
                </Button>
              </div>
            ))}
        </div>
        {open?.dirty && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            {t("terms.edit.notSaved")}
          </span>
        )}
        {/* A type with a planned offer shows its plan, and no Offer until that is cancelled. */}
        {!open && (current || planned.length === 0) && (
          <Button variant={current ? "ghost" : "outline"} size="sm" onClick={onEdit}>
            {t(current ? "terms.edit.edit" : "terms.edit.offer")}
          </Button>
        )}
      </div>
      {open?.editor}
    </li>
  );
}
