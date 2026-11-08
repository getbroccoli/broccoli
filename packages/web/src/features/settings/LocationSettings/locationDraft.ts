import type { LocationCreateInput, LocationUpdateInput } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** The stack's values: the name typed and the id of the terms picked in the select. */
export type LocationDraft = { name: string; termsId: string };

/** A location as saved; termsId is the terms `Location.terms` shows (the default terms when none chosen). */
export type SavedLocation = { id: string; name: string; termsId: string };

/** The update input with only what changed; the default terms are sent as null; null when nothing changed. */
export function locationUpdateInput(
  saved: SavedLocation,
  draft: LocationDraft,
  defaultTermsId: string,
): LocationUpdateInput | null {
  const renamed = draft.name.trim() !== saved.name;
  const termsChanged = draft.termsId !== saved.termsId;
  if (!renamed && !termsChanged) return null;
  return {
    id: saved.id,
    ...(renamed && { name: draft.name }),
    ...(termsChanged && { termsId: termsIdOf(draft.termsId, defaultTermsId) }),
  };
}

/** The create input; termsId left out when the default terms are picked. */
export function locationCreateInput(
  draft: LocationDraft,
  defaultTermsId: string,
): LocationCreateInput {
  return {
    name: draft.name,
    ...(draft.termsId !== defaultTermsId && { termsId: draft.termsId }),
  };
}

/** The footer's save line; null when nothing changed, or a new location has no name yet. saved null: a new location. */
export function saveLine({
  saved,
  draft,
  termsName,
}: {
  saved: { name: string; termsId: string } | null;
  draft: LocationDraft;
  termsName: string;
}): string | null {
  const name = draft.name.trim();
  if (!saved)
    return name ? t("settings.locations.saveLine.added", { name, terms: termsName }) : null;
  const renamed = name !== saved.name;
  const termsChanged = draft.termsId !== saved.termsId;
  if (renamed && termsChanged)
    return t("settings.locations.saveLine.renamedAndTerms", { from: saved.name, to: name });
  if (renamed) return t("settings.locations.saveLine.renamed", { from: saved.name, to: name });
  if (termsChanged) return t("settings.locations.saveLine.terms", { name: saved.name });
  return null;
}

/** The amber note when the terms change; peopleCount people are in the location now. */
export function termsNote({
  name,
  fromTerms,
  toTerms,
  peopleCount,
}: {
  name: string;
  fromTerms: string;
  toTerms: string;
  peopleCount: number;
}): string {
  const moved = t("settings.locations.termsNote", { name, from: fromTerms, to: toTerms });
  if (peopleCount === 0) return moved;
  const stay =
    peopleCount === 1
      ? t("settings.locations.termsNote.stayOne", { name })
      : t("settings.locations.termsNote.stay", { name, count: String(peopleCount) });
  return `${moved} ${stay}`;
}

function termsIdOf(termsId: string, defaultTermsId: string): string | null {
  return termsId === defaultTermsId ? null : termsId;
}
