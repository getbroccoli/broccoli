import { Link, useNavigate } from "@tanstack/react-router";

import type { TimeOffSettingsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { BuiltInPill } from "./BuiltInPill";
import { TimeOffTypeIcon } from "./TimeOffTypeIcon";

type Props = {
  /** Every time off type, in the server's order. */
  timeOffTypes: TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"];
};

/** The time off types as a table of name and the days taken this year. */
export function TimeOffTypeTable({ timeOffTypes }: Props) {
  const navigate = useNavigate();
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
            <th scope="col" className="px-4 py-3 font-medium">
              {t("settings.timeOff.typeColumn")}
            </th>
            <th scope="col" className="w-40 px-4 py-3 text-right font-medium">
              {t("settings.timeOff.takenColumn")}
            </th>
          </tr>
        </thead>
        <tbody>
          {timeOffTypes.map(({ timeOffType, daysTakenThisYear }) => (
            <tr
              key={timeOffType.id}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
              onClick={() =>
                void navigate({
                  to: "/settings/time-off/$timeOffTypeId",
                  params: { timeOffTypeId: timeOffType.id },
                })
              }
            >
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                <span className="flex items-center gap-3">
                  <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
                  {/* The row opens the type too; the link gives keyboards and screen readers the way in. */}
                  <Link
                    to="/settings/time-off/$timeOffTypeId"
                    params={{ timeOffTypeId: timeOffType.id }}
                    className="min-w-0 [overflow-wrap:anywhere] hover:underline"
                    // The link navigates itself, and a Ctrl or Cmd click opens a tab, not the row too.
                    onClick={(event) => event.stopPropagation()}
                  >
                    {timeOffType.name}
                  </Link>
                  {timeOffType.typeKey && <BuiltInPill />}
                </span>
              </th>
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
