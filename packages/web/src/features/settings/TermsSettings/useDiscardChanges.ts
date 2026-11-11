import { toast } from "sonner";

import {
  DiscardTermsTimeOffRulesDocument,
  DiscardTermsWorkingWeekDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { TERMS_REFETCH } from "./termsQueries";

/** Discarding an unpublished week or a type's unpublished rules. */
export function useDiscardChanges() {
  const options = { refetch: TERMS_REFETCH };
  const [discardWeek, weekState] = usePayloadMutation(DiscardTermsWorkingWeekDocument, options);
  const [discardRules, rulesState] = usePayloadMutation(DiscardTermsTimeOffRulesDocument, options);

  const discard = async (kind: "week" | "rules", versionId: string) => {
    try {
      const run = kind === "week" ? discardWeek : discardRules;
      await run({ variables: { input: { versionId } } });
      toast(t("terms.edit.discarded"));
    } catch {
      toast.error(t("terms.edit.discardFailed"));
    }
  };

  return {
    discardWeek: (versionId: string) => void discard("week", versionId),
    discardRules: (versionId: string) => void discard("rules", versionId),
    discarding: weekState.loading || rulesState.loading,
  };
}
