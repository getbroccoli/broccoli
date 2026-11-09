import { useLazyQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";

import { LocationStartTermsDocument } from "@/__generated__/graphql";
import { companyToday } from "@/features/termsDisplay";

import { termsPeriodsOn, type TermsPeriod } from "./EmploymentTermsTab";
import { locationSavedText } from "./locationSavedText";

/**
 * After a person's location is saved, says their terms stay when the location starts new people
 * on other terms. Only admins read which terms a location starts people on; anyone else, or a
 * failed read, gets no toast.
 */
export function useLocationSavedToast({
  firstName,
  periods,
}: {
  firstName: string;
  periods: readonly TermsPeriod[];
}): (locationId: string) => void {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const [readLocations] = useLazyQuery(LocationStartTermsDocument, { fetchPolicy: "network-only" });
  return (locationId) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) return;
    const termsName = termsPeriodsOn(periods, companyToday()).current?.termsName;
    void readLocations()
      .then(({ data }) => {
        const location = data?.locations.find(({ id }) => id === locationId);
        const text =
          termsName &&
          location &&
          locationSavedText({
            firstName,
            termsName,
            locationName: location.name,
            locationTermsName: location.terms.name,
          });
        if (text) toast(text);
      })
      .catch(() => undefined);
  };
}
