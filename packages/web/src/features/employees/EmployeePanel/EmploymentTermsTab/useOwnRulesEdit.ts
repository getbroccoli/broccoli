import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  PersonRulesSinceDocument,
  SetOwnRulesDocument,
  type RuleSource,
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
  versionOn,
} from "@/features/termsDisplay";
import { t } from "@/i18n";
import { addDays } from "@/lib/calendarDay";

import { forgetHistory } from "../../cache";
import {
  ownRulesSavedToast,
  ownRulesSaveLine,
  termsRulesSavedToast,
  termsRulesSaveLine,
} from "./ownRulesText";
import { rulesBefore, rulesDateError } from "./ownRulesForm";

/** What a type row edits: the person's own rules, or a return to their terms' rules. */
export type OwnRulesMode = "own" | "terms";

/** The rules form with the date it applies from. */
export type OwnRulesDraft = RulesValues & { startDate: string };

/** A person's rules for a type from a date, and where they come from. */
export type PersonRules = {
  source: RuleSource;
  startDate: string;
  endDate?: string | null;
  rules: { balance: TimeOffBalanceKind };
};

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
  const shown = draft ?? closedDraft(today);
  const { terms, termsRules } = useTermsRules(opened, shown.startDate);
  const termsOffer = termsRules === undefined ? null : termsRules !== null;
  const { versions, loadFailed } = useRulesSince(employeeId, opened);
  const formError =
    opened && formErrorOf(opened, shown, { versions, termsBalance: termsRules?.balance ?? null });
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
      opened && versions && !formError
        ? saveLineOf(opened, {
            firstName,
            startDate: shown.startDate,
            today,
            versions,
            terms,
            termsOffer,
          })
        : null,
    error: loadFailed
      ? t("ownRules.loadFailed", { name: firstName })
      : (failure ?? formError ?? null),
    changed: isChanged(opened, draft),
    saving: setting.loading || returning.loading,
    open: (start) => {
      setOpened(start);
      setDraft(startDraftOf(start));
    },
    edit: (changed) => {
      setDraft(changed);
      setFailure(null);
    },
    close,
    save: async () => {
      if (!opened || !versions || formError) return;
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
        toast(
          savedToastOf(opened, {
            firstName,
            startDate: shown.startDate,
            terms,
            termsOffer: termsOffer ?? true,
          }),
        );
        close();
      } catch (error) {
        setFailure(failureOf(error));
      }
    },
  };
}

type Opened = Parameters<OwnRulesEdit["open"]>[0];

/**
 * The terms a return gives the person back to on `startDate`, and their rules for the type then:
 * null when they don't offer it, undefined while loading.
 */
function useTermsRules(opened: Opened | null, startDate: string) {
  const terms = opened?.termsOn(startDate) ?? null;
  const read = useQuery(TermsTypeOfferDocument, {
    variables: { termsId: terms?.termsId ?? "", timeOffTypeId: opened?.timeOffType.id ?? "" },
    skip: opened?.mode !== "terms" || !terms,
  });
  const versions = read.data?.terms?.timeOff[0]?.versions;
  return { terms, termsRules: versions && versionOn(versions, startDate) };
}

/**
 * The person's rules for the open type from the day before the earliest "Applies from" on,
 * undefined while loading or after the read failed; reopening the form reads them again.
 */
function useRulesSince(employeeId: string, opened: Opened | null) {
  const read = useQuery(PersonRulesSinceDocument, {
    variables: { id: employeeId, from: addDays(opened?.earliest ?? companyToday(), -1) },
    skip: !opened,
    fetchPolicy: "network-only",
  });
  const versions = read.data?.employee?.employmentTerms?.timeOff?.find(
    ({ timeOffType }) => timeOffType.id === opened?.timeOffType.id,
  )?.versions;
  return { versions, loadFailed: read.error !== undefined };
}

/** What saving does; null while whether the terms offer the type is loading. */
function saveLineOf(
  start: Opened,
  {
    firstName,
    startDate,
    today,
    versions,
    terms,
    termsOffer,
  }: {
    firstName: string;
    startDate: string;
    today: string;
    versions: readonly PersonRules[];
    terms: { termsName: string } | null;
    termsOffer: boolean | null;
  },
): string | null {
  const values = { firstName, typeName: start.timeOffType.name, startDate, today };
  if (start.mode === "own") {
    const onDate = versionOn(versions, startDate);
    return ownRulesSaveLine({
      ...values,
      alreadyOwn: onDate?.source === "THEIR_OWN",
      offer: onDate === null,
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
    termsOffer,
  }: {
    firstName: string;
    startDate: string;
    terms: { termsName: string } | null;
    termsOffer: boolean;
  },
): string {
  const typeName = start.timeOffType.name;
  return start.mode === "own"
    ? ownRulesSavedToast(firstName, typeName)
    : termsRulesSavedToast({
        firstName,
        typeName,
        termsName: terms?.termsName ?? "",
        termsOffer,
        startDate,
      });
}

/** What the form holds while closed. */
function closedDraft(today: string): OwnRulesDraft {
  return { balance: "NO_BALANCE", days: "", onTop: true, startDate: today };
}

/** Whether the open form differs from how it opened. */
function isChanged(opened: Opened | null, draft: OwnRulesDraft | null): boolean {
  return (
    opened !== null &&
    draft !== null &&
    JSON.stringify(draft) !== JSON.stringify(startDraftOf(opened))
  );
}

/** The form as it opens: the rules it starts from, from the start of this leave year. */
function startDraftOf(start: Opened): OwnRulesDraft {
  return {
    ...rulesValuesOf(start.current ?? start.timeOffType.defaultRules),
    startDate: start.earliest,
  };
}

/**
 * Why the form can't be saved: the date, invalid days, or a change of how the type counts from
 * the day before off the start of a leave year; null when it can.
 */
function formErrorOf(
  start: Opened,
  draft: OwnRulesDraft,
  {
    versions,
    termsBalance,
  }: { versions: readonly PersonRules[] | undefined; termsBalance: TimeOffBalanceKind | null },
): string | null {
  const days = start.mode === "own" ? daysError(draft) : undefined;
  return (
    rulesDateError({
      startDate: draft.startDate,
      earliest: start.earliest,
      before: (versions && rulesBefore(versions, draft.startDate)?.rules.balance) ?? null,
      balance: start.mode === "own" ? draft.balance : termsBalance,
    }) ??
    days ??
    null
  );
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
