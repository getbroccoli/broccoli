import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  SetOwnRulesDocument,
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
  const { terms, termsOffer } = useTermsOffer(opened, shown.startDate);
  const formError = opened && formErrorOf(opened, shown);
  const close = () => {
    setOpened(null);
    setDraft(null);
    setFailure(null);
  };
  return {
    mode: opened?.mode ?? null,
    timeOffTypeId: opened?.timeOffType.id ?? null,
    draft: shown,
    earliest: opened?.earliest ?? today,
    line:
      opened && !formError
        ? saveLineOf(opened, { firstName, startDate: shown.startDate, today, terms, termsOffer })
        : null,
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
      try {
        await (opened.mode === "own"
          ? setOwn({ variables: { input: { ...input, rules: rulesInputOf(shown) } } })
          : returnToTerms({ variables: { input } }));
        toast(savedToastOf(opened, { firstName, startDate: shown.startDate, terms }));
        close();
      } catch (error) {
        setFailure(failureOf(error));
      }
    },
  };
}

type Opened = Parameters<OwnRulesEdit["open"]>[0];

/** The terms a return gives the person back to on `startDate`, and whether they offer the type then. */
function useTermsOffer(opened: Opened | null, startDate: string) {
  const terms = opened?.termsOn(startDate) ?? null;
  const read = useQuery(TermsTypeOfferDocument, {
    variables: { termsId: terms?.termsId ?? "", timeOffTypeId: opened?.timeOffType.id ?? "" },
    skip: opened?.mode !== "terms" || !terms,
  });
  return { terms, termsOffer: offeredOn(read.data?.terms?.timeOff[0]?.versions, startDate) };
}

/** What saving does; null while whether the terms offer the type is loading. */
function saveLineOf(
  start: Opened,
  {
    firstName,
    startDate,
    today,
    terms,
    termsOffer,
  }: {
    firstName: string;
    startDate: string;
    today: string;
    terms: { termsName: string } | null;
    termsOffer: boolean | null;
  },
): string | null {
  const values = { firstName, typeName: start.timeOffType.name, startDate, today };
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
}

/** The toast after a save. */
function savedToastOf(
  start: Opened,
  {
    firstName,
    startDate,
    terms,
  }: { firstName: string; startDate: string; terms: { termsName: string } | null },
): string {
  const typeName = start.timeOffType.name;
  return start.mode === "own"
    ? ownRulesSavedToast(firstName, typeName)
    : termsRulesSavedToast({ firstName, typeName, termsName: terms?.termsName ?? "", startDate });
}

/** The form as it opens: the rules it starts from, from the start of this leave year. */
function startDraftOf(start: Opened): OwnRulesDraft {
  return {
    ...rulesValuesOf(start.current ?? start.timeOffType.defaultRules),
    startDate: start.earliest,
  };
}

/**
 * Why the form can't be saved: no date or one before the earliest, invalid days, or a change of
 * how the type counts off the start of a leave year; null when it can.
 */
function formErrorOf(start: Opened, draft: OwnRulesDraft): string | null {
  const currentBalance = start.current?.balance ?? null;
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
  const refused =
    error instanceof PayloadFailure
      ? (error.payloadError as { fields?: { code: string }[] })
      : null;
  const fields = refused?.fields ?? [];
  return fields.some(({ code }) => code === "not_leave_year_start")
    ? t("ownRules.countsDate")
    : t("ownRules.failed");
}
