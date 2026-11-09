import { toast } from "sonner";

import {
  ChangeTermsTimeOffRulesDocument,
  ChangeTermsWorkingWeekDocument,
  OfferTermsTimeOffDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { rulesInputOf } from "../TimeOffSettings";
import { savedToast } from "./termsDraft";
import { TERMS_REFETCH, type Terms } from "./termsQueries";
import { companyToday, weekOfDraft } from "@/features/termsDisplay";
import type { OpenSection } from "./useTermsEditing";

/** Saving the open section from its date: the week, a type's new rules, or an offer. */
export function useSaveSection(terms: Terms) {
  const options = { refetch: TERMS_REFETCH };
  const [changeWeek, weekState] = usePayloadMutation(ChangeTermsWorkingWeekDocument, options);
  const [changeRules, rulesState] = usePayloadMutation(ChangeTermsTimeOffRulesDocument, options);
  const [offer, offerState] = usePayloadMutation(OfferTermsTimeOffDocument, options);

  /** Saves and says so; resolves with whether it saved. */
  const save = async (open: OpenSection, startDate: string): Promise<boolean> => {
    try {
      if (open.kind === "week") {
        const input = {
          workingPatternId: terms.workingPattern.id,
          startDate,
          ...weekOfDraft(open.draft),
          bankHolidayCalendar: open.draft.calendar,
        };
        await changeWeek({ variables: { input } });
        toast(savedToast(t("terms.week.title"), terms.name, startDate, companyToday()));
        return true;
      }
      const row = terms.timeOff.find(({ timeOffType }) => timeOffType.id === open.timeOffTypeId)!;
      const rules = rulesInputOf(open.draft);
      if (row.policy) {
        const input = { timeOffPolicyId: row.policy.id, startDate, rules };
        await changeRules({ variables: { input } });
      } else {
        const input = { termsId: terms.id, timeOffTypeId: open.timeOffTypeId, startDate, rules };
        await offer({ variables: { input } });
      }
      toast(savedToast(row.timeOffType.name, terms.name, startDate, companyToday()));
      return true;
    } catch {
      toast.error(t("terms.edit.saveFailed"));
      return false;
    }
  };

  return { save, saving: weekState.loading || rulesState.loading || offerState.loading };
}
