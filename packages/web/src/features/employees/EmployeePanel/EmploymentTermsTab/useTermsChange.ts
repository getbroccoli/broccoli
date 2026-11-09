import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ChangeTermsDocument,
  type ChangeTermsMutation,
  ChangeTermsFormTermsDocument,
  type EmploymentTermsTab_TermsFragment,
  TermsChangePreviewDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { companyToday, shortDate, versionOn } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../../cache";
import { savedToast, skipError } from "../../ChangeTermsForm";

/** The terms and date picked in Change terms; no terms until one is picked. */
export interface TermsChoice {
  termsId: string | null;
  startDate: string;
}

/** One person's Change terms edit, as the tab and the panel footer use it. */
export interface TermsChange {
  open: boolean;
  value: TermsChoice;
  earliest: string;
  termsName: string;
  /** What the person would be on after the move, for the rows' change lines; null until known. */
  after: EmploymentTermsTab_TermsFragment | null;
  /** What of their own the person keeps on that date, for the save line. */
  keepsOwn: string[];
  error: string | null;
  /** A move is picked that would reach the person. */
  ready: boolean;
  /** Something is picked, so leaving asks first. */
  changed: boolean;
  saving: boolean;
  /** Opens the edit; a move may apply from `earliestChange` on. */
  start: (earliestChange: string) => void;
  edit: (value: TermsChoice) => void;
  close: () => void;
  save: () => Promise<void>;
}

/** One person's Change terms edit: closed until `start`, then what the picked move would do. */
export function useTermsChange({
  employeeId,
  firstName,
}: {
  employeeId: string;
  firstName: string;
}): TermsChange {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<TermsChoice>({ termsId: null, startDate: companyToday() });
  const [earliest, setEarliest] = useState(companyToday());
  const [error, setError] = useState<string | null>(null);
  const { input, termsName, moves, skipped, loading } = usePreview(employeeId, value, open);
  // The payload carries the person's new terms; History reads its new line when shown.
  const [changeTerms, mutation] = usePayloadMutation(ChangeTermsDocument, {
    update: forgetHistory,
  });
  const texts = { firstName, termsName, startDate: value.startDate };
  const close = () => {
    setOpen(false);
    setError(null);
    mutation.reset();
  };
  const saved = (payload: ChangeTermsMutation["employees"]["changeTerms"]) => {
    const moved = payload.moved?.[0];
    const reason = payload.skipped?.[0]?.reason;
    if (moved) {
      toast(savedToast({ ...texts, startDate: moved.startDate, today: companyToday() }));
      close();
    } else if (reason) {
      setError(skipError({ ...texts, reason }));
    }
  };

  return {
    open,
    value,
    earliest,
    termsName,
    after: moves[0]?.employmentTerms ?? null,
    keepsOwn: moves[0] ? keptOwn(moves[0].employmentTerms, laterOf(value.startDate)) : [],
    error: error ?? (skipped[0] && value.termsId ? skipError({ ...texts, ...skipped[0] }) : null),
    ready: moves.length > 0 && !loading,
    changed: open && value.termsId !== null,
    saving: mutation.loading,
    start: (earliestChange) => {
      const today = companyToday();
      setEarliest(earliestChange);
      setValue({ termsId: null, startDate: earliestChange > today ? earliestChange : today });
      setOpen(true);
    },
    edit: (next) => {
      setError(null);
      setValue(next);
    },
    close,
    save: async () => {
      if (!value.termsId || mutation.loading) return;
      await changeTerms({ variables: { input } }).then(saved, (failed: unknown) =>
        setError(failureMessage(failed, earliest)),
      );
    },
  };
}

/** The picked terms' name and what moving to them would do, read once terms are picked. */
function usePreview(employeeId: string, value: TermsChoice, open: boolean) {
  const input = {
    employeeIds: [employeeId],
    termsId: value.termsId ?? "",
    startDate: value.startDate,
  };
  const { data: terms } = useQuery(ChangeTermsFormTermsDocument, { skip: !open });
  // Read afresh each time: a save or cancel since may have changed the answer.
  const preview = useQuery(TermsChangePreviewDocument, {
    variables: { input },
    fetchPolicy: "network-only",
    skip: !open || !input.termsId,
  });
  return {
    input,
    termsName: terms?.allTerms.find(({ id }) => id === input.termsId)?.name ?? "",
    // A skipped query keeps its last answer, which a closed edit must not show.
    ...((open && preview.data?.termsChangePreview) || { moves: [], skipped: [] }),
    loading: preview.loading,
  };
}

// The preview's versions start today, so a past date reads today's.
function laterOf(date: string): string {
  const today = companyToday();
  return date > today ? date : today;
}

/** The week and each type the person has their own on `date`, by name. */
function keptOwn(
  { workingWeek, timeOff }: EmploymentTermsTab_TermsFragment,
  date: string,
): string[] {
  const own = (
    versions: readonly { source: string; startDate: string; endDate?: string | null }[],
  ) => versionOn(versions, date)?.source === "THEIR_OWN";
  return [
    ...(own(workingWeek) ? [t("changeTerms.workingWeek")] : []),
    ...(timeOff ?? []).flatMap(({ timeOffType, versions }) =>
      own(versions) ? [timeOffType.name] : [],
    ),
  ];
}

type ChangeTermsError = ChangeTermsMutation["employees"]["changeTerms"]["error"];

/** The form's message for a refused or failed save. */
function failureMessage(failed: unknown, earliest: string): string {
  const refused =
    failed instanceof PayloadFailure ? (failed.payloadError as ChangeTermsError) : null;
  const tooEarly =
    refused?.__typename === "InvalidInputError" &&
    refused.fields.some(({ field }) => field === "startDate");
  return tooEarly
    ? t("changeTerms.tooEarly", { date: shortDate(earliest) })
    : t("changeTerms.failed");
}
