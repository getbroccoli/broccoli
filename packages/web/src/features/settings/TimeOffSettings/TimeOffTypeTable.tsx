import type { TimeOffBalanceKind, TimeOffSettingsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { TimeOffTypeIcon } from "./TimeOffTypeIcon";

type Props = {
  /** Every time off type, in the server's order. */
  timeOffTypes: TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"];
};

/** The time off types as a table of name, how each counts and the days taken this year. */
export function TimeOffTypeTable({ timeOffTypes }: Props) {
  if (timeOffTypes.length === 0) {
    return (
      <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        {t("settings.timeOff.empty")}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 font-medium">
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
            <tr key={timeOffType.id} className="border-b border-border last:border-0">
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                <span className="flex items-center gap-3">
                  <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
                  {timeOffType.name}
                </span>
              </th>
              <td className="px-4 py-3 text-muted-foreground">{countsText(balance)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatDays(daysTakenThisYear)}</td>
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
