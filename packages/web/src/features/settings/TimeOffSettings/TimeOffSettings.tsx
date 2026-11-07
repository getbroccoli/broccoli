import { useQuery } from "@apollo/client/react";
import { Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { TimeOffSettingsDocument, type TimeOffSettingsQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { type ListedTimeOffType, TimeOffTypeDialog } from "./TimeOffTypeDialog";
import { TimeOffTypeTable } from "./TimeOffTypeTable";

type Settings = TimeOffSettingsQuery["timeOffSettings"];

/**
 * The Settings page's Time off section: every time off type and how much was taken; admins add
 * types here and change their name, look and privacy.
 */
export function TimeOffSettings() {
  // Days taken change whenever someone books, so the list reloads whenever shown.
  const { data, error, refetch } = useQuery(TimeOffSettingsDocument, {
    fetchPolicy: "cache-and-network",
  });
  // "new" adds a type; a type opens it to edit.
  const [dialog, setDialog] = useState<"new" | ListedTimeOffType | null>(null);

  return (
    <section aria-labelledby="time-off-settings-title" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="time-off-settings-title" className="text-lg font-semibold">
            {t("settings.timeOff.title")}
          </h2>
          {data && <p className="text-sm text-muted-foreground">{summary(data.timeOffSettings)}</p>}
        </div>
        {data && (
          <Button type="button" variant="outline" onClick={() => setDialog("new")}>
            <Plus aria-hidden />
            {t("settings.timeOff.add")}
          </Button>
        )}
      </div>
      {data ? (
        <TimeOffTypeTable timeOffTypes={data.timeOffSettings.timeOffTypes} onEdit={setDialog} />
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
      {dialog && (
        <TimeOffTypeDialog
          type={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
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
