import type { TimeOffSettingsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { TimeOffTypeRows } from "./TimeOffTypeRows";

type Props = {
  /** Every time off type, in the server's order. */
  timeOffTypes: TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"];
};

/**
 * The time off types with how each counts and the days taken this year. A type with one policy is
 * one row; a type with several lists them beneath it, always expanded. Each opens the type's panel.
 */
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
      <table className="w-full table-fixed text-sm">
        <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <tr className="border-b border-border">
            <th scope="col" className="w-[52%] px-4 py-3 font-medium">
              {t("settings.timeOff.typeColumn")}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {t("settings.timeOff.countsColumn")}
            </th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">
              {t("settings.timeOff.takenColumn")}
            </th>
          </tr>
        </thead>
        {timeOffTypes.map((row) => (
          <TimeOffTypeRows key={row.timeOffType.id} row={row} />
        ))}
      </table>
    </div>
  );
}
