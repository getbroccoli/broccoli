import { t } from "@/i18n";

/**
 * The toast after a location is saved when the location starts new people on other terms than the
 * person's, saying their terms stay; null when they match.
 */
export function locationSavedText({
  firstName,
  termsName,
  locationName,
  locationTermsName,
}: {
  firstName: string;
  termsName: string;
  locationName: string;
  locationTermsName: string;
}): string | null {
  return termsName === locationTermsName
    ? null
    : t("people.panel.location.otherTerms", {
        name: firstName,
        terms: termsName,
        location: locationName,
        locationTerms: locationTermsName,
      });
}
