import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  SetOwnRulesDocument,
  type TimeOffBalanceKind,
  type TimeOffRulesInput,
  TermsTypeOfferDocument,
  UseTermsRulesDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import {
  companyToday,
  daysError,
  rulesInputOf,
  type RulesValues,
  rulesValuesOf,
  shortDate,
  splitVersions,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import {
  ownRulesSavedToast,
  ownRulesSaveLine,
  termsRulesSavedToast,
  termsRulesSaveLine,
} from "./ownRulesText";

/** What a type row edits: the person's own rules, or a return to their terms' rules. */
export type OwnRulesMode = "own" | "terms";

/** The rules form with the date it applies from. */
export type OwnRulesDraft = RulesValues & { startDate: string };

/** The terms a person is on on a date. */
export type TermsOn = (date: string) => { termsId: string; termsName: string } | null;

/** One person's open rules edit for one type on the Employment terms tab, for the row and the footer. */
export interface OwnRulesEdit {
  mode: OwnRulesMode | null;
  /** The type being edited; null while closed. */
  timeOffTypeId: string | null;
  draft: OwnRulesDraft;
  earliest: string;
  /** How the type counts on the day the form opened from; null when not offered then. */
  currentBalance: TimeOffBalanceKind | null;
  /** What saving does; null while the form can't be saved. */
  line: string | null;
  error: string | null;
  changed: boolean;
  saving: boolean;
  open: (start: {
    mode: OwnRulesMode;
    timeOffType: { id: string; name: string; defaultRules: TimeOffRulesInput };
    /** The rules the form starts from; null to start from the type's default rules. */
    current: TimeOffRulesInput | null;
    earliest: string;
    alreadyOwn: boolean;
    termsOn: TermsOn;
  }) => void;
  edit: (draft: OwnRulesDraft) => void;
  close: () => void;
  save: () => Promise<void>;
}

/** A person's rules edit for a type: closed until `open`, then the rules or date picked and its save. */
export function useOwnRulesEdit({
  employeeId,
  firstName,
}: {
  employeeId: string;
  firstName: string;
}): OwnRulesEdit {
  const [opened, setOpened] = useState<Parameters<OwnRulesEdit["open"]>[0] | null>(null);
  const [draft, setDraft] = useState<OwnRulesDraft | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [setOwn, setting] = usePayloadMutation(SetOwnRulesDocument, { update: forgetHistory });
  const [returnToTerms, returning] = usePayloadMutation(UseTermsRulesDocument, {
    update: forgetHistory,
  });
  const today = companyToday();
  const shown = draft ?? {
    balance: "NO_BALANCE" as const,
    days: "",
    onTop: true,
    startDate: today,
  };
  const terms = opened?.termsOn(shown.startDate) ?? null;
  const offerRead = useQuery(TermsTypeOfferDocument, {
    variables: { termsId: terms?.termsId ?? "", timeOffTypeId: opened?.timeOffType.id ?? "" },
    skip: opened?.mode !== "terms" || !terms,
  });
  const termsOffer = offeredOn(offerRead.data?.terms?.timeOff[0]?.versions, shown.startDate);
  const currentBalance = opened?.current?.balance ?? null;
  const formError = opened && formErrorOf(opened, shown, currentBalance);
  const close = () => {
    setOpened(null);
    setDraft(null);
    setFailure(null);
  };
  const lineOf = (start: NonNullable<typeof opened>) => {
    const values = {
      firstName,
      typeName: start.timeOffType.name,
      startDate: shown.startDate,
      today,
    };
    if (start.mode === "own") {
      return ownRulesSaveLine({
        ...values,
        alreadyOwn: start.alreadyOwn,
        offer: !start.alreadyOwn && start.current === null,
      });
    }
    return termsOffer === null
      ? null
      : termsRulesSaveLine({ ...values, termsName: terms?.termsName ?? "", termsOffer });
  };

  return {
    mode: opened?.mode ?? null,
    timeOffTypeId: opened?.timeOffType.id ?? null,
    draft: shown,
    earliest: opened?.earliest ?? today,
    currentBalance,
    line: opened && !formError ? lineOf(opened) : null,
    error: failure ?? formError ?? null,
    changed:
      opened !== null &&
      draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(startDraftOf(opened)),
    saving: setting.loading || returning.loading,
    open: (start) => {
      setOpened(start);
      setDraft(startDraftOf(start));
    },
    edit: setDraft,
    close,
    save: async () => {
      if (!opened || formError) return;
      setFailure(null);
      const input = {
        employeeId,
        timeOffTypeId: opened.timeOffType.id,
        startDate: shown.startDate,
      };
      const typeName = opened.timeOffType.name;
      try {
        if (opened.mode === "own") {
          await setOwn({ variables: { input: { ...input, rules: rulesInputOf(shown) } } });
          toast(ownRulesSavedToast(firstName, typeName));
        } else {
          await returnToTerms({ variables: { input } });
          toast(
            termsRulesSavedToast({
              firstName,
              typeName,
              termsName: terms?.termsName ?? "",
              startDate: shown.startDate,
            }),
          );
        }
        close();
      } catch (error) {
        setFailure(failureOf(error));
      }
    },
  };
}

/** The form as it opens: the rules it starts from, from the start of this leave year. */
function startDraftOf(start: Parameters<OwnRulesEdit["open"]>[0]): OwnRulesDraft {
  return {
    ...rulesValuesOf(start.current ?? start.timeOffType.defaultRules),
    startDate: start.earliest,
  };
}

/**
 * Why the form can't be saved: no date or one before the earliest, invalid days, or a change of
 * how the type counts off the start of a leave year; null when it can.
 */
function formErrorOf(
  start: Parameters<OwnRulesEdit["open"]>[0],
  draft: OwnRulesDraft,
  currentBalance: TimeOffBalanceKind | null,
): string | null {
  if (!draft.startDate || draft.startDate < start.earliest) {
    return t("terms.edit.tooEarly", { date: shortDate(start.earliest) });
  }
  if (start.mode === "terms") return null;
  const days = daysError(draft);
  if (days) return days;
  // The person's first day has nothing before it to count differently from.
  const startsYear = draft.startDate.endsWith("-01-01") || draft.startDate === start.earliest;
  return currentBalance && draft.balance !== currentBalance && !startsYear
    ? t("ownRules.countsDate")
    : null;
}

/** Whether the terms' versions cover `date`; null while they load. */
function offeredOn(
  versions: readonly { startDate: string; endDate?: string | null }[] | undefined,
  date: string,
): boolean | null {
  if (!versions) return null;
  return splitVersions(versions, date).current !== null;
}

/** What the form says when the server refuses the save. */
function failureOf(error: unknown): string {
  const fields =
    error instanceof PayloadFailure && "fields" in error.payloadError
      ? (error.payloadError.fields as { code: string }[])
      : [];
  return fields.some(({ code }) => code === "not_leave_year_start")
    ? t("ownRules.countsDate")
    : t("ownRules.failed");
}
