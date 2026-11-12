import { CalendarBlank } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { addDays } from "@/lib/calendarDay";
import { cn } from "@/lib/class-names";
import {
  companyToday,
  plannedLine,
  ruleLine,
  shortDate,
  splitVersions,
  TimeOffTypeIcon,
} from "@/features/termsDisplay";

import { DraftPill } from "./DraftPill";
import type { TimeOffRow } from "./termsQueries";

type Props = {
  row: TimeOffRow;
  termsName: string;
  /** The open form with the line under the name; null while the row is closed. */
  open: { editor: ReactNode; summary: string; dirty: boolean } | null;
  onEdit: () => void;
  onStop: () => void;
  onCancelPlanned: (version: TimeOffRow["versions"][number]) => void;
  onCancelStop: (version: TimeOffRow["versions"][number]) => void;
  onDiscard: () => void;
};

/**
 * One time off type on the terms: its rules today or "Not offered here", planned and unpublished
 * rules and a planned stop, or its form.
 */
export function TimeOffRuleRow({
  row,
  termsName,
  open,
  onEdit,
  onStop,
  onCancelPlanned,
  onCancelStop,
  onDiscard,
}: Props) {
  const { timeOffType, unpublished } = row;
  const { current, planned } = splitVersions(row.versions, companyToday());
  // The last rules ending is a planned stop: the type is not offered from the day after.
  const stopped = planned.at(-1) ?? current;
  const stopDate = stopped?.endDate ? addDays(stopped.endDate, 1) : null;
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
              (current
                ? [ruleLine(current), timeOffType.private && t("terms.timeOff.private")]
                    .filter(Boolean)
                    .join(" · ")
                : t("terms.timeOff.notOffered", { terms: termsName }))}
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
          {!open && stopped && stopDate && (
            <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted-foreground">
              <CalendarBlank aria-hidden className="shrink-0" />
              <span className="flex-1">
                {t("terms.timeOff.stops", { date: shortDate(stopDate) })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onCancelStop(stopped)}>
                {t("terms.edit.cancelChange")}
              </Button>
            </div>
          )}
          {!open && unpublished && (
            <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted-foreground">
              <DraftPill />
              <span className="flex-1">
                {unpublished.stops
                  ? t("terms.timeOff.stopDraft")
                  : [ruleLine(unpublished), timeOffType.private && t("terms.timeOff.private")]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
              <Button variant="ghost" size="sm" onClick={onDiscard}>
                {t("terms.edit.discard")}
              </Button>
            </div>
          )}
        </div>
        {open?.dirty && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            {t("terms.edit.notSaved")}
          </span>
        )}
        {/* A type with a planned offer or stop shows its plan, and no Offer, Edit or Stop until that is cancelled. */}
        {!open && !stopDate && current && planned.length === 0 && !unpublished && (
          <Button variant="ghost" size="sm" onClick={onStop}>
            {t("terms.edit.stop")}
          </Button>
        )}
        {!open &&
          !stopDate &&
          !unpublished?.stops &&
          (current || unpublished || planned.length === 0) && (
            <Button
              variant={current || unpublished ? "ghost" : "outline"}
              size="sm"
              onClick={onEdit}
            >
              {t(current || unpublished ? "terms.edit.edit" : "terms.edit.offer")}
            </Button>
          )}
      </div>
      {open?.editor}
    </li>
  );
}
