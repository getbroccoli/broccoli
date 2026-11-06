import { useQuery } from "@apollo/client/react";
import { Info, MapPin, X } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  CreateLocationDocument,
  LocationSettingsDocument,
  type LocationSettingsQuery,
  UpdateLocationDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscardChangesDialog } from "@/features/employees";
import { t } from "@/i18n";

import { DeleteLocation } from "./DeleteLocation";
import {
  type LocationDraft,
  locationCreateInput,
  locationUpdateInput,
  saveLine,
  termsNote,
} from "./locationDraft";
import { saveFailure } from "./saveFailure";

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
      <SheetContent aria-describedby={undefined} className={SHEET}>
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

type Location = LocationSettingsQuery["locations"][number];
type Terms = LocationSettingsQuery["allTerms"][number];

function LocationEditor({
  location,
  allTerms,
  onClose,
}: {
  location: Location | null;
  allTerms: readonly Terms[];
  onClose: () => void;
}) {
  const defaultTermsId = allTerms.find(({ isDefault }) => isDefault)!.id;
  const saved = location && { id: location.id, name: location.name, termsId: location.terms.id };
  const [draft, setDraft] = useState<LocationDraft>({
    name: location?.name ?? "",
    termsId: location?.terms.id ?? defaultTermsId,
  });
  const [discarding, setDiscarding] = useState(false);
  // The table is in the server's order, so it reloads with a new location in its place.
  const [createLocation, creation] = usePayloadMutation(CreateLocationDocument, {
    refetch: [LocationSettingsDocument],
  });
  const [updateLocation, update] = usePayloadMutation(UpdateLocationDocument);
  const saving = location ? update : creation;
  const busy = saving.loading;
  const failure = saveFailure(saving.payloadError, saving.error);
  const termsNameOf = (id: string) => allTerms.find((terms) => terms.id === id)?.name ?? "";
  const line = saveLine({ saved, draft, termsName: termsNameOf(draft.termsId) });
  const changes = [
    draft.name.trim() !== (saved?.name ?? ""),
    draft.termsId !== (saved?.termsId ?? defaultTermsId),
  ].filter(Boolean).length;

  const close = () => (changes > 0 && !busy ? setDiscarding(true) : onClose());

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    try {
      if (saved) {
        const input = locationUpdateInput(saved, draft, defaultTermsId);
        if (!input) return;
        await updateLocation({ variables: { input } });
        toast(t("settings.locations.saved", { name }));
      } else {
        await createLocation({ variables: { input: locationCreateInput(draft, defaultTermsId) } });
        toast(t("settings.locations.added", { name }));
      }
      onClose();
    } catch {
      // The refusal shows under the form.
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent aria-describedby={undefined} className={SHEET}>
        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center gap-4 border-b border-border px-6 py-5">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
            >
              <MapPin size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">
                {location?.name ?? t("settings.locations.new")}
              </SheetTitle>
              {location && (
                <p className="truncate text-[13px] text-muted-foreground">
                  {[peopleText(location.peopleCount), location.terms.name].join(" · ")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("settings.locations.close")}
              onClick={close}
            >
              <X />
            </Button>
          </header>

          <div className="subtle-scrollbar flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="location-name">{t("settings.locations.name")}</Label>
              <Input
                id="location-name"
                value={draft.name}
                autoFocus={!location}
                readOnly={busy}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="location-terms">{t("settings.locations.terms")}</Label>
              <select
                id="location-terms"
                aria-describedby="location-terms-hint"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                value={draft.termsId}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, termsId: event.target.value })}
              >
                {allTerms.map(({ id, name, isDefault }) => (
                  <option key={id} value={id}>
                    {isDefault ? t("settings.locations.defaultOption", { name }) : name}
                  </option>
                ))}
              </select>
              <p id="location-terms-hint" className="text-[13px] text-muted-foreground">
                {t("settings.locations.termsHint")}
              </p>
              {location && draft.termsId !== location.terms.id && (
                <p
                  role="status"
                  className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900"
                >
                  <Info size={18} aria-hidden className="mt-0.5 shrink-0" />
                  {termsNote({
                    name: location.name,
                    fromTerms: location.terms.name,
                    toTerms: termsNameOf(draft.termsId),
                    peopleCount: location.peopleCount,
                  })}
                </p>
              )}
            </div>

            {failure && (
              <p role="alert" className="text-sm text-destructive">
                {t(failure, { name: draft.name.trim() })}
              </p>
            )}

            {location && (
              <DeleteLocation location={location} disabled={saving.loading} onDeleted={onClose} />
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3 max-md:sticky max-md:bottom-0 max-md:bg-background">
            <p className="min-w-0 flex-[1_1_16rem] text-sm text-muted-foreground">{line}</p>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {t("settings.locations.cancel")}
            </Button>
            <Button type="submit" disabled={busy || line === null}>
              {t("settings.locations.save")}
            </Button>
          </footer>
        </form>
        <DiscardChangesDialog
          open={discarding}
          count={changes}
          name={location?.name ?? t("settings.locations.new")}
          onDiscard={onClose}
          onKeepEditing={() => setDiscarding(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function peopleText(count: number): string {
  return count === 1
    ? t("settings.locations.peopleOne")
    : t("settings.locations.people", { count: String(count) });
}

/** Full screen on a phone, as the terms stack is. */
const SHEET = "max-md:inset-0 max-md:w-full max-md:rounded-none max-md:border-0";
