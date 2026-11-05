import { useQuery } from "@apollo/client/react";

import {
  type TimeOffBalanceKind,
  TimeOffSettingsDocument,
  type TimeOffSettingsQuery,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { TimeOffTypeIcon } from "./TimeOffTypeIcon";

type Settings = TimeOffSettingsQuery["timeOffSettings"];

/** The Settings page's Time off section: every time off type, how it counts and how much was taken. */
export function TimeOffSettings() {
  // Days taken change whenever someone books, so the list reloads whenever shown.
  const { data, error, refetch } = useQuery(TimeOffSettingsDocument, {
    fetchPolicy: "cache-and-network",
  });

  return (
    <section aria-labelledby="time-off-settings-title" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="time-off-settings-title" className="text-lg font-semibold">
          {t("settings.timeOff.title")}
        </h2>
        {data && <p className="text-sm text-muted-foreground">{summary(data.timeOffSettings)}</p>}
      </div>
      {data ? (
        <TimeOffTypeTable timeOffTypes={data.timeOffSettings.timeOffTypes} />
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.timeOff.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.email.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[200px] rounded-xl" />
      )}
    </section>
  );
}

function TimeOffTypeTable({ timeOffTypes }: { timeOffTypes: Settings["timeOffTypes"] }) {
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

function summary({ timeOffTypes, peopleWithTimeOff }: Settings): string {
  const types = timeOffTypes.length;
  const typesText = t(types === 1 ? "settings.timeOff.typeOne" : "settings.timeOff.types", {
    count: String(types),
  });
  if (peopleWithTimeOff === 0) {
    return t("settings.timeOff.summary", { types: typesText });
  }
  const peopleText = t(
    peopleWithTimeOff === 1 ? "settings.locations.peopleOne" : "settings.locations.people",
    { count: String(peopleWithTimeOff) },
  );
  return t("settings.timeOff.summaryWithPeople", { types: typesText, people: peopleText });
}

function countsText(balance: TimeOffBalanceKind | null | undefined): string {
  return t(balance ? COUNTS[balance] : "settings.timeOff.noPolicy");
}

const COUNTS = {
  BALANCE_FROM_ALLOWANCE: "settings.timeOff.fromBalance",
  UNLIMITED_BALANCE: "settings.timeOff.unlimited",
  NO_BALANCE: "settings.timeOff.doesNotCount",
} as const satisfies Record<TimeOffBalanceKind, string>;
