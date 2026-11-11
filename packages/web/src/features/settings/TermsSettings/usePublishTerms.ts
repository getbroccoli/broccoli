import { useLazyQuery } from "@apollo/client/react";
import { toast } from "sonner";

import { PublishTermsDocument, TermsPublishSuggestionsDocument } from "@/__generated__/graphql";
import { evictRecord, PayloadFailure, useCache, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";
import { shortDate } from "@/features/termsDisplay";

import { TERMS_REFETCH, type Terms } from "./termsQueries";

/** What Publish sends besides the terms: from when, and who gets their drafts. */
export interface PublishChoice {
  startDate: string;
  owners: { termsId?: string | null; employeeId?: string | null }[];
}

/**
 * Publishing the terms' drafts as the screen shows them, so drafts saved again elsewhere are
 * refused rather than published unseen. Terms nobody was ever on, whose drafts reach nobody else,
 * publish from their earliest date without asking; the rest open the dialog.
 */
export function usePublishTerms(terms: Terms, openDialog: () => void) {
  const cache = useCache();
  const [readSuggestions] = useLazyQuery(TermsPublishSuggestionsDocument, {
    fetchPolicy: "no-cache",
  });
  const [publishTerms, state] = usePayloadMutation(PublishTermsDocument, {
    refetch: TERMS_REFETCH,
  });

  /** Publishes and says so; resolves with whether it published. */
  const publish = async (choice: PublishChoice): Promise<boolean> => {
    try {
      const versions = draftsOf(terms);
      await publishTerms({ variables: { input: { termsId: terms.id, versions, ...choice } } });
      toast(t("terms.publish.done", { terms: terms.name }));
      return true;
    } catch (error) {
      const failure = error instanceof PayloadFailure ? (error.payloadError as Failure) : null;
      toast.error(failureMessage(failure, terms.earliestChange));
      if (failure?.__typename === "ConflictError") {
        // The drafts changed since they were read: read the terms again before publishing.
        evictRecord(cache, "Terms", terms.id);
        return true;
      }
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
    const owners = data?.terms?.publishSuggestions.owners;
    if (!owners || owners.length > 1) {
      openDialog();
      return;
    }
    await publish({ startDate: terms.earliestChange, owners: [{ termsId: terms.id }] });
  };

  return { start: () => void start(), publish, publishing: state.loading };
}

type Failure = {
  __typename: string;
  message: string;
  fields?: { field: string; code: string }[];
};

/** The terms' drafts as Publish names them: each with the revision the screen shows. */
function draftsOf(terms: Terms): { id: string; revision: number }[] {
  return [terms.unpublishedWorkingWeek, ...terms.timeOff.map(({ unpublished }) => unpublished)]
    .filter((draft) => draft !== null)
    .map(({ id, revision }) => ({ id, revision }));
}

/** What a refused publish says: the conflict as the server words it, or what to change. */
function failureMessage(failure: Failure | null, earliest: string): string {
  if (failure?.__typename === "ConflictError") return failure.message;
  const code = failure?.fields?.[0]?.code;
  if (code === "not_leave_year_start") return t("terms.publish.countsDate");
  if (code === "too_early") return t("terms.edit.tooEarly", { date: shortDate(earliest) });
  if (code === "overlaps") return t("terms.publish.overlaps");
  return t("terms.publish.failed");
}
