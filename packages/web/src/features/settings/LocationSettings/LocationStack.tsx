import { useQuery } from "@apollo/client/react";
import { X } from "@phosphor-icons/react";

import { LocationSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { LOCATION_SHEET, LocationEditor } from "./LocationEditor";

type Props = {
  /** Null: a new location. */
  locationId: string | null;
  onClose: () => void;
};

/** One location over the table, or a new one: its name and the terms its new people start on. */
export function LocationStack({ locationId, onClose }: Props) {
  const { data, error, loading, refetch } = useQuery(LocationSettingsDocument);
  const location = data?.locations.find(({ id }) => id === locationId) ?? null;

  if (data && (locationId === null || location)) {
    return <LocationEditor location={location} allTerms={data.allTerms} onClose={onClose} />;
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined} className={LOCATION_SHEET}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">
              {loading ? <Skeleton className="h-6 w-48" /> : null}
              {!loading &&
                t(error ? "settings.locations.loadFailed" : "settings.locations.notFound")}
            </SheetTitle>
            <SheetClose
              render={
                <Button variant="ghost" size="icon" aria-label={t("settings.locations.close")} />
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
              {t("settings.locations.retry")}
            </Button>
          )}
          {loading && <Skeleton className="h-40 w-full" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
