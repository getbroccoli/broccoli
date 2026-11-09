import type { TermsDeleteBlocker } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** The disabled Delete item's reason, naming the locations that start people on the terms. */
export function deleteReason(
  blocker: TermsDeleteBlocker,
  locationNames: readonly string[],
): string {
  switch (blocker) {
    case "DEFAULT_TERMS":
      return t("terms.delete.default");
    case "TERMS_HAD_PEOPLE":
      return t("terms.delete.hadPeople");
    case "LOCATION_STARTS_PEOPLE_ON_TERMS":
      return t(locationNames.length === 1 ? "terms.delete.location" : "terms.delete.locations", {
        locations: LIST.format(locationNames),
      });
  }
}

/** The taken-name error, naming the terms already called so, matched ignoring case and surrounding spaces. */
export function takenNameError(name: string, termsNames: readonly string[]): string {
  const taken = termsNames.find((existing) => sameName(existing, name));
  return taken ? t("terms.name.taken", { name: taken }) : t("terms.name.takenUnknown");
}

/** The name field's message for a refused save, by its error code; a failure without one reads generic. */
export function nameError(
  code: string | undefined,
  name: string,
  termsNames: readonly string[],
): string {
  if (code === "taken") return takenNameError(name, termsNames);
  if (code === "required") return t("terms.name.required");
  if (code === "too_long") return t("terms.name.tooLong");
  return t("terms.saveFailed");
}

function sameName(one: string, other: string): boolean {
  return one.trim().toLowerCase() === other.trim().toLowerCase();
}

const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });
