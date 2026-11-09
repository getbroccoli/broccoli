import { toast } from "sonner";

import {
  ChangeTermsTimeOffRulesDocument,
  ChangeTermsWorkingWeekDocument,
  OfferTermsTimeOffDocument,
  StopTermsTimeOffDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { rulesInputOf } from "../TimeOffSettings";
import { savedToast, weekOfDraft } from "./termsDraft";
import { TERMS_REFETCH, type Terms } from "./termsQueries";
import { companyToday } from "@/features/termsDisplay";
import type { OpenSection } from "./useTermsEditing";

/** Saving the open section from its date: the week, a type's new rules, an offer or a stop. */
export function useSaveSection(terms: Terms) {
  const options = { refetch: TERMS_REFETCH };
  const [changeWeek, weekState] = usePayloadMutation(ChangeTermsWorkingWeekDocument, options);
  const [changeRules, rulesState] = usePayloadMutation(ChangeTermsTimeOffRulesDocument, options);
  const [offer, offerState] = usePayloadMutation(OfferTermsTimeOffDocument, options);
  const [stop, stopState] = usePayloadMutation(StopTermsTimeOffDocument, options);

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
      if (open.stop) {
        await stop({
          variables: { input: { timeOffPolicyId: row.policy!.id, stopDate: startDate } },
        });
      } else if (row.policy) {
        const input = { timeOffPolicyId: row.policy.id, startDate, rules };
        await changeRules({ variables: { input } });
      } else {
        const input = { termsId: terms.id, timeOffTypeId: open.timeOffTypeId, startDate, rules };
        await offer({ variables: { input } });
      }
      toast(savedToast(row.timeOffType.name, terms.name, startDate, companyToday()));
      return true;
    } catch (error) {
      // A refused stop says who has time off booked; other refusals are mistakes the form prevents.
      const failure =
        error instanceof PayloadFailure
          ? (error as PayloadFailure<{ __typename: string; message: string }>).payloadError
          : null;
      toast.error(
        failure?.__typename === "ConflictError" ? failure.message : t("terms.edit.saveFailed"),
      );
      return false;
    }
  };

  return {
    save,
    saving: weekState.loading || rulesState.loading || offerState.loading || stopState.loading,
  };
}
