import { useQuery } from "@apollo/client/react";
import { type FormEvent, useState } from "react";

import {
  CreateLocationDocument,
  LocationSettingsDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { LocationRow } from "./LocationRow";
import { nameFailure } from "./nameFailure";

/** The Settings page's Locations section: the places people work, which admins add, rename and delete. */
export function LocationSettings() {
  const { data, error, refetch } = useQuery(LocationSettingsDocument);
  const [name, setName] = useState("");
  // The list is ordered by the server, so it reloads with the new location in its place.
  const [createLocation, creation] = usePayloadMutation(CreateLocationDocument, {
    refetch: [LocationSettingsDocument],
  });
  const failure = nameFailure(creation.payloadError);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    await createLocation({ variables: { input: { name } } }).catch(() => undefined);
    setName((current) => (current === name ? "" : current));
  };

  return (
    <section aria-labelledby="location-settings-title" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="location-settings-title" className="text-lg font-semibold">
          {t("settings.locations.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.locations.description")}</p>
      </div>
      {data ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {data.locations.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {t("settings.locations.empty")}
            </p>
          ) : (
            <ul>
              {data.locations.map((location) => (
                <LocationRow key={location.id} location={location} />
              ))}
            </ul>
          )}
          <form onSubmit={(event) => void add(event)} className="flex flex-col gap-1 border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                aria-label={t("settings.locations.newName")}
                placeholder={t("settings.locations.newName")}
                value={name}
                aria-invalid={failure !== null}
                aria-describedby={failure ? "new-location-error" : undefined}
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" disabled={creation.loading}>
                {t("settings.locations.add")}
              </Button>
            </div>
            {failure && (
              <p id="new-location-error" role="alert" className="text-sm text-destructive">
                {t(failure, { name: name.trim() })}
              </p>
            )}
          </form>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.locations.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.email.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[120px] rounded-xl" />
      )}
    </section>
  );
}
