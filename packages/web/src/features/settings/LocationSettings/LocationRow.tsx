import { type FormEvent, useState } from "react";

import {
  DeleteLocationDocument,
  type LocationSettingsQuery,
  UpdateLocationDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

import { forgetLocation } from "../cache";
import { nameFailure } from "./nameFailure";

type Props = {
  location: LocationSettingsQuery["locations"][number];
};

/** One location in Settings: its name and people, renamed in place, deleted while nobody is in it. */
export function LocationRow({ location }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [updateLocation, update] = usePayloadMutation(UpdateLocationDocument);
  const [deleteLocation, deletion] = usePayloadMutation(DeleteLocationDocument, {
    update: (cache, { data }) => {
      if (data?.location.delete.deletedLocationId) forgetLocation(cache, location.id);
    },
  });
  const failure = nameFailure(update.payloadError, update.error);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null) return;
    await updateLocation({ variables: { input: { id: location.id, name: draft } } })
      .then(() => setDraft(null))
      .catch(() => undefined);
  };

  const cancel = () => {
    setDraft(null);
    update.reset();
  };

  if (draft !== null) {
    return (
      <li className="border-b border-border/60 px-3 py-2 last:border-b-0">
        <form onSubmit={(event) => void rename(event)} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Input
              aria-label={t("settings.locations.rename", { name: location.name })}
              value={draft}
              autoFocus
              aria-invalid={failure !== null}
              aria-describedby={failure ? `location-${location.id}-error` : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && cancel()}
            />
            <Button type="submit" disabled={update.loading}>
              {t("settings.locations.save")}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel}>
              {t("settings.locations.cancel")}
            </Button>
          </div>
          {failure && (
            <p
              id={`location-${location.id}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {t(failure, { name: draft.trim() })}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 border-b border-border/60 px-4 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{location.name}</p>
        <p className="text-xs text-muted-foreground">
          {location.peopleCount === 1
            ? t("settings.locations.peopleOne")
            : t("settings.locations.people", { count: String(location.peopleCount) })}
        </p>
        {(deletion.payloadError || deletion.error) && (
          <p role="alert" className="text-sm text-destructive">
            {t(
              deletion.payloadError?.__typename === "ConflictError"
                ? "settings.locations.inUse"
                : "settings.locations.failed",
              { name: location.name },
            )}
          </p>
        )}
      </div>
      <Button type="button" variant="ghost" onClick={() => setDraft(location.name)}>
        {t("settings.locations.renameAction")}
      </Button>
      {location.peopleCount === 0 && (
        <Button
          type="button"
          variant="ghost"
          disabled={deletion.loading}
          onClick={() =>
            void deleteLocation({ variables: { input: { id: location.id } } }).catch(
              () => undefined,
            )
          }
        >
          {t("settings.locations.delete")}
        </Button>
      )}
    </li>
  );
}
