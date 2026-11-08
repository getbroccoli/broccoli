import { useQuery } from "@apollo/client/react";
import { X } from "@phosphor-icons/react";

import { TimeOffSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { TimeOffTypeRecord } from "./TimeOffTypeRecord";

type Props = {
  timeOffTypeId: string;
  onClose: () => void;
};

/** One time off type over the list: its name, look and privacy, edited in place. */
export function TimeOffTypeStack({ timeOffTypeId, onClose }: Props) {
  // The list under the panel loads the same query, so opening a row reads it from the cache.
  const { data, error, loading, refetch } = useQuery(TimeOffSettingsDocument);
  const type = data?.timeOffSettings.timeOffTypes.find(
    ({ timeOffType }) => timeOffType.id === timeOffTypeId,
  )?.timeOffType;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      {/* Full screen on a phone, as the person's panel is inset everywhere. */}
      <SheetContent
        aria-describedby={undefined}
        className="max-md:inset-0 max-md:w-full max-md:rounded-none max-md:border-0"
      >
        {type ? (
          // A saved change starts the form again from the saved values.
          <TimeOffTypeRecord key={JSON.stringify(type)} type={type} onDeleted={onClose} />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                {loading ? <Skeleton className="h-6 w-48" /> : null}
                {!loading && t(error ? "settings.timeOff.loadFailed" : "settings.timeOff.notFound")}
              </SheetTitle>
              <SheetClose
                render={
                  <Button variant="ghost" size="icon" aria-label={t("settings.timeOff.close")} />
                }
              >
                <X />
              </SheetClose>
            </div>
            {!loading && error && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void refetch()}
              >
                {t("settings.email.retry")}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
