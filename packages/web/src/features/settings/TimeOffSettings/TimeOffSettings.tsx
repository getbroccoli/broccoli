import { useQuery } from "@apollo/client/react";

import { TimeOffSettingsDocument, type TimeOffSettingsQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { TimeOffTypeTable } from "./TimeOffTypeTable";

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

function summary({ timeOffTypes, peopleWithTimeOff }: Settings): string {
  const types = timeOffTypes.length;
  const typesText = t(types === 1 ? "settings.timeOff.typeOne" : "settings.timeOff.types", {
    count: String(types),
  });
  if (peopleWithTimeOff === 0) {
    return t("settings.timeOff.summary", { types: typesText });
  }
  const peopleText = t(
    peopleWithTimeOff === 1 ? "settings.timeOff.personOne" : "settings.timeOff.people",
    { count: String(peopleWithTimeOff) },
  );
  return t("settings.timeOff.summaryWithPeople", { types: typesText, people: peopleText });
}
