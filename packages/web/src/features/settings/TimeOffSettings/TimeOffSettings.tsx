import { useQuery } from "@apollo/client/react";
import { Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { TimeOffSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { AddTimeOffTypeDialog } from "./AddTimeOffTypeDialog";
import { TimeOffTypeTable } from "./TimeOffTypeTable";

/**
 * The Settings page's Time off section: every time off type; admins add
 * types here and change their name, look and privacy.
 */
export function TimeOffSettings() {
  // Another admin may change the types, so the list reloads whenever shown.
  const { data, error, refetch } = useQuery(TimeOffSettingsDocument, {
    fetchPolicy: "cache-and-network",
  });
  const [adding, setAdding] = useState(false);

  return (
    <section aria-labelledby="time-off-settings-title" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="time-off-settings-title" className="text-lg font-semibold">
          {t("settings.timeOff.title")}
        </h2>
        {data && (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("settings.timeOff.add")}
          </Button>
        )}
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
      {adding && (
        <AddTimeOffTypeDialog
          refetch={[TimeOffSettingsDocument]}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
