import { Info, MapPin, X } from "@phosphor-icons/react";
import { useBlocker } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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

/** Full screen on a phone, as the terms stack is. */
export const LOCATION_SHEET = "max-md:inset-0 max-md:w-full max-md:rounded-none max-md:border-0";

type Props = {
  /** Null: a new location. */
  location: LocationSettingsQuery["locations"][number] | null;
  allTerms: LocationSettingsQuery["allTerms"];
  onClose: () => void;
};

/** A location's name and terms in its stack, saved together; a new location when there is none. */
export function LocationEditor({ location, allTerms, onClose }: Props) {
  const defaultTermsId = allTerms.find(({ isDefault }) => isDefault)!.id;
  const saved = location && { id: location.id, name: location.name, termsId: location.terms.id };
  // Only the fields edited; the others follow the saved location, so a reload never turns into a change.
  const [edits, setEdits] = useState<Partial<LocationDraft>>({});
  const draft: LocationDraft = {
    name: edits.name ?? location?.name ?? "",
    termsId: edits.termsId ?? location?.terms.id ?? defaultTermsId,
  };
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

  // Set once saved or deleted, so leaving afterwards asks nothing.
  const done = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => !done.current && changes > 0,
    enableBeforeUnload: () => !done.current && changes > 0,
    withResolver: true,
  });
  const finish = () => {
    done.current = true;
    onClose();
  };
  // A save in flight keeps the stack open, so its refusal still shows.
  const close = () => !busy && onClose();

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
      finish();
    } catch {
      // The refusal shows under the form.
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent aria-describedby={undefined} className={LOCATION_SHEET}>
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
                onChange={(event) => setEdits({ ...edits, name: event.target.value })}
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
                onChange={(event) => setEdits({ ...edits, termsId: event.target.value })}
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
              <DeleteLocation location={location} disabled={saving.loading} onDeleted={finish} />
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3 max-md:sticky max-md:bottom-0 max-md:bg-background">
            <p className="min-w-0 flex-[1_1_16rem] text-sm text-muted-foreground">{line}</p>
            <div className="ml-auto flex gap-3">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {t("settings.locations.cancel")}
              </Button>
              <Button type="submit" disabled={busy || line === null}>
                {t("settings.locations.save")}
              </Button>
            </div>
          </footer>
        </form>
        <DiscardChangesDialog
          open={blocker.status === "blocked"}
          count={changes}
          name={location?.name ?? t("settings.locations.new")}
          onDiscard={() => blocker.proceed?.()}
          onKeepEditing={() => blocker.reset?.()}
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
