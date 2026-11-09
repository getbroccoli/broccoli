import { useState } from "react";
import { toast } from "sonner";

import {
  type BankHolidayCalendar,
  SetOwnWorkingWeekDocument,
  UseTermsWorkingWeekDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import {
  companyToday,
  DAY_FIELDS,
  type WeekDraft,
  weekDraftOf,
  weekErrors,
  weekOfDraft,
  type WeekVersion,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import {
  ownWeekSavedToast,
  ownWeekSaveLine,
  termsWeekSavedToast,
  termsWeekSaveLine,
} from "./ownWeekText";

/** What the week row edits: the person's own week, or a return to their terms' week. */
export type OwnWeekMode = "own" | "terms";

/** One person's open week edit on the Employment terms tab, as the row and the panel footer use it. */
export interface OwnWeekEdit {
  mode: OwnWeekMode | null;
  draft: WeekDraft;
  /** The week the editor started from, for its "Was …" hint. */
  current: WeekVersion | null;
  earliest: string;
  /** The terms whose week a return gives back. */
  termsName: string;
  /** What saving does; null while the form can't be saved. */
  line: string | null;
  error: string | null;
  changed: boolean;
  saving: boolean;
  open: (start: {
    mode: OwnWeekMode;
    current: WeekVersion;
    earliest: string;
    alreadyOwn: boolean;
    termsName: string;
  }) => void;
  edit: (draft: WeekDraft) => void;
  close: () => void;
  save: () => Promise<void>;
}

/** A person's week edit: closed until `open`, then the week or date picked and its save. */
export function useOwnWeekEdit({
  employeeId,
  firstName,
}: {
  employeeId: string;
  firstName: string;
}): OwnWeekEdit {
  const [opened, setOpened] = useState<Parameters<OwnWeekEdit["open"]>[0] | null>(null);
  const [draft, setDraft] = useState<WeekDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const [setOwn, setting] = usePayloadMutation(SetOwnWorkingWeekDocument, {
    update: forgetHistory,
  });
  const [returnToTerms, returning] = usePayloadMutation(UseTermsWorkingWeekDocument, {
    update: forgetHistory,
  });
  const today = companyToday();
  const shown = draft ?? { hours: [], calendar: "ENGLAND_AND_WALES" as const, startDate: today };
  const valid = opened !== null && hasNoErrors(opened.mode, shown, opened.earliest);
  const close = () => {
    setOpened(null);
    setDraft(null);
    setFailed(false);
  };
  const lineOf = (mode: OwnWeekMode) => {
    const values = { firstName, startDate: shown.startDate, today };
    return mode === "own"
      ? ownWeekSaveLine({ ...values, alreadyOwn: opened?.alreadyOwn ?? false })
      : termsWeekSaveLine({ ...values, termsName: opened?.termsName ?? "" });
  };

  return {
    mode: opened?.mode ?? null,
    draft: shown,
    current: opened?.current ?? null,
    earliest: opened?.earliest ?? today,
    termsName: opened?.termsName ?? "",
    line: opened && valid ? lineOf(opened.mode) : null,
    error: failed ? t("ownWeek.failed") : null,
    changed: opened !== null && draft !== null && changedFrom(opened.current, draft, today),
    saving: setting.loading || returning.loading,
    open: (start) => {
      setOpened(start);
      setDraft({ ...weekDraftOf(start.current, today), startDate: laterOf(start.earliest, today) });
    },
    edit: setDraft,
    close,
    save: async () => {
      if (!opened || !valid) return;
      const input = { employeeId, startDate: shown.startDate };
      try {
        if (opened.mode === "own") {
          await setOwn({ variables: { input: { ...input, ...weekInput(shown) } } });
          toast(ownWeekSavedToast(firstName));
        } else {
          await returnToTerms({ variables: { input } });
          toast(termsWeekSavedToast({ firstName, termsName: opened.termsName, ...input }));
        }
        close();
      } catch {
        setFailed(true);
      }
    },
  };
}

/** The week form as the mutation takes it: minutes each day and the bank holidays. */
function weekInput(draft: WeekDraft) {
  const week = weekOfDraft(draft);
  return {
    ...Object.fromEntries(DAY_FIELDS.map((day) => [day, week[day]])),
    bankHolidayCalendar: draft.calendar,
  } as Record<(typeof DAY_FIELDS)[number], number> & { bankHolidayCalendar: BankHolidayCalendar };
}

function hasNoErrors(mode: OwnWeekMode, draft: WeekDraft, earliest: string): boolean {
  const errors = weekErrors(draft, earliest);
  return mode === "own" ? Object.keys(errors).length === 0 : !errors.startDate;
}

/** Something differs from what the form opened with, so leaving asks first. */
function changedFrom(current: WeekVersion, draft: WeekDraft, today: string): boolean {
  const start = weekDraftOf(current, today);
  return (
    draft.calendar !== start.calendar ||
    draft.hours.some((hours, index) => hours !== start.hours[index]) ||
    draft.startDate !== today
  );
}

function laterOf(date: string, other: string): string {
  return date > other ? date : other;
}
