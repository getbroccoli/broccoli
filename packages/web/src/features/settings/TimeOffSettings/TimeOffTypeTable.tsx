import type { TimeOffBalanceKind, TimeOffSettingsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import type { ListedTimeOffType } from "./TimeOffTypeDialog";
import { TimeOffTypeIcon } from "./TimeOffTypeIcon";

type Props = {
  /** Every time off type, in the server's order. */
  timeOffTypes: TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"];
  /** Opens a type to change its name, look and privacy. */
  onEdit: (timeOffType: ListedTimeOffType) => void;
};

/** The time off types as a table of name, how each counts and the days taken this year. */
export function TimeOffTypeTable({ timeOffTypes, onEdit }: Props) {
  if (timeOffTypes.length === 0) {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        {t("settings.timeOff.empty")}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full table-fixed text-sm">
        <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <tr className="border-b border-border">
            <th scope="col" className="w-[45%] px-4 py-3 font-medium">
              {t("settings.timeOff.typeColumn")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("settings.timeOff.countsColumn")}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t("settings.timeOff.takenColumn")}
            </th>
          </tr>
        </thead>
        <tbody>
          {timeOffTypes.map(({ timeOffType, balance, daysTakenThisYear }) => (
            <tr
              key={timeOffType.id}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
              // The name's button is the keyboard way in; the whole row is a larger target.
              onClick={() => onEdit(timeOffType)}
            >
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  className="flex items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(timeOffType);
                  }}
                >
                  <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{timeOffType.name}</span>
                </button>
              </th>
              <td className="px-4 py-3 text-muted-foreground">{countsText(balance)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {daysTakenThisYear === 0 ? "0" : formatDays(daysTakenThisYear)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function countsText(balance: TimeOffBalanceKind | null | undefined): string {
  return t(balance ? COUNTS[balance] : "settings.timeOff.noPolicy");
}

const COUNTS = {
  BALANCE_FROM_ALLOWANCE: "settings.timeOff.fromBalance",
  UNLIMITED_BALANCE: "settings.timeOff.unlimited",
  NO_BALANCE: "settings.timeOff.doesNotCount",
} as const satisfies Record<TimeOffBalanceKind, string>;
