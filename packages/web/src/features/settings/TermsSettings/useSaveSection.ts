import { toast } from "sonner";

import {
  SaveTermsTimeOffRulesDocument,
  SaveTermsWorkingWeekDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { weekOfDraft } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { rulesInputOf } from "../TimeOffSettings";
import { TERMS_REFETCH, type Terms } from "./termsQueries";
import type { OpenSection } from "./useTermsEditing";

/** Saving the open section as the terms' unpublished week or a type's unpublished rules. */
export function useSaveSection(terms: Terms) {
  const options = { refetch: TERMS_REFETCH };
  const [saveWeek, weekState] = usePayloadMutation(SaveTermsWorkingWeekDocument, options);
  const [saveRules, rulesState] = usePayloadMutation(SaveTermsTimeOffRulesDocument, options);

  /** Saves and says so; resolves with whether it saved. */
  const save = async (open: OpenSection): Promise<boolean> => {
    try {
      if (open.kind === "week") {
        const input = {
          termsId: terms.id,
          ...weekOfDraft(open.draft),
          bankHolidayCalendar: open.draft.calendar,
        };
        await saveWeek({ variables: { input } });
        toast(t("terms.edit.saved", { what: t("terms.week.title"), terms: terms.name }));
        return true;
      }
      const row = terms.timeOff.find(({ timeOffType }) => timeOffType.id === open.timeOffTypeId)!;
      const input = {
        termsId: terms.id,
        timeOffTypeId: open.timeOffTypeId,
        rules: rulesInputOf(open.draft),
      };
      await saveRules({ variables: { input } });
      toast(t("terms.edit.saved", { what: row.timeOffType.name, terms: terms.name }));
      return true;
    } catch {
      toast.error(t("terms.edit.saveFailed"));
      return false;
    }
  };

  return { save, saving: weekState.loading || rulesState.loading };
}
