import { Link } from "@tanstack/react-router";

import type { TimeOffSettingsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { countsText, reachText } from "./policyText";
import { TimeOffTypeIcon } from "./TimeOffTypeIcon";

type TimeOffTypeRow = TimeOffSettingsQuery["timeOffSettings"]["timeOffTypes"][number];

type Props = {
  /** Every time off type, in the server's order. */
  timeOffTypes: TimeOffTypeRow[];
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
          <TypeRows key={row.timeOffType.id} row={row} />
        ))}
      </table>
    </div>
  );
}

function TypeRows({ row: { timeOffType, policies, daysTakenThisYear } }: { row: TimeOffTypeRow }) {
  const [only] = policies.length === 1 ? policies : [];
  return (
    <tbody className="border-b border-border last:border-0">
      <tr className="hover:bg-muted/40">
        <th scope="row" className="px-4 py-3 text-left font-semibold">
          <Link
            to="/settings/time-off/$timeOffTypeId"
            params={{ timeOffTypeId: timeOffType.id }}
            className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
            <span className="flex min-w-0 flex-col">
              <span className="[overflow-wrap:anywhere]">{timeOffType.name}</span>
              {only && (
                <span className="text-xs font-normal text-muted-foreground">{reachText(only)}</span>
              )}
            </span>
          </Link>
        </th>
        <td className="px-4 py-3 text-muted-foreground">
          {only
            ? countsText(only)
            : policies.length === 0
              ? t("settings.timeOff.noPolicy")
              : t("settings.timeOff.policyCount", { count: String(policies.length) })}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {daysTakenThisYear === 0 ? "0" : formatDays(daysTakenThisYear)}
        </td>
      </tr>
      {!only &&
        policies.map((policy) => (
          <tr key={policy.id} className={policy.peopleCount === 0 ? "text-muted-foreground" : ""}>
            <td className="py-1.5 pr-4 pl-[3.75rem] align-top last:pb-3">
              <Link
                to="/settings/time-off/$timeOffTypeId"
                params={{ timeOffTypeId: timeOffType.id }}
                search={{ policy: policy.id }}
                className="flex flex-col rounded-md outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="font-medium [overflow-wrap:anywhere]">{policy.name}</span>
                <span className="text-xs text-muted-foreground">{reachText(policy)}</span>
              </Link>
            </td>
            <td className="px-4 py-1.5 align-top">{countsText(policy)}</td>
            <td />
          </tr>
        ))}
    </tbody>
  );
}
