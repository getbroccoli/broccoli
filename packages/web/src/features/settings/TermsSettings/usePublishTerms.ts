import { useLazyQuery } from "@apollo/client/react";
import { toast } from "sonner";

import { PublishTermsDocument, TermsPublishSuggestionsDocument } from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { TERMS_REFETCH, type Terms } from "./termsQueries";

type Failure = { __typename: string; message: string };

/** What Publish sends: the unpublished versions it read, from when, and who gets them. */
export interface PublishChoice {
  versions: { id: string; revision: number }[];
  startDate: string;
  owners: { termsId?: string | null; employeeId?: string | null }[];
}

/**
 * Publishing the terms' unpublished week and rules. Terms nobody was ever on, which nobody else's
 * settings share, publish from their earliest date without asking; the rest open the dialog.
 */
export function usePublishTerms(terms: Terms, openDialog: () => void) {
  const [readSuggestions] = useLazyQuery(TermsPublishSuggestionsDocument, {
    fetchPolicy: "no-cache",
  });
  const [publishTerms, state] = usePayloadMutation(PublishTermsDocument, {
    refetch: TERMS_REFETCH,
  });

  /** Publishes and says so; resolves with whether it published. */
  const publish = async (choice: PublishChoice): Promise<boolean> => {
    try {
      await publishTerms({ variables: { input: { termsId: terms.id, ...choice } } });
      toast(t("terms.publish.done", { terms: terms.name }));
      return true;
    } catch (error) {
      // A conflict says what changed since the dialog opened, such as rules saved again.
      const failure = error instanceof PayloadFailure ? (error.payloadError as Failure) : null;
      toast.error(
        failure?.__typename === "ConflictError" ? failure.message : t("terms.publish.failed"),
      );
      return false;
    }
  };

  const start = async () => {
    if (terms.hadPeople) {
      openDialog();
      return;
    }
    const { data } = await readSuggestions({
      variables: { id: terms.id, from: terms.earliestChange },
    });
    const suggestions = data?.terms?.publishSuggestions;
    if (!suggestions || suggestions.owners.length > 1) {
      openDialog();
      return;
    }
    await publish({
      versions: suggestions.versions.map(({ id, revision }) => ({ id, revision })),
      startDate: terms.earliestChange,
      owners: [{ termsId: terms.id }],
    });
  };

  return { start: () => void start(), publish, publishing: state.loading };
}
