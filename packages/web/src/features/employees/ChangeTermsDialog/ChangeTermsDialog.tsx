import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  BulkChangeTermsDocument,
  type BulkChangeTermsMutation,
  BulkTermsChangePreviewDocument,
  ChangeTermsFormTermsDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { companyToday, shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { forgetHistory } from "../cache";
import { ChangeTermsForm } from "../ChangeTermsForm";
import {
  bulkGroups,
  bulkLines,
  bulkSavedToast,
  bulkSaveLine,
  bulkTitle,
} from "./bulkChangeTermsText";

type Props = {
  employeeIds: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs once the move is saved, such as clearing the selection. */
  onChanged: () => void;
};

/**
 * Moves the selected people to other terms from a date: the shared form, then who won't move as
 * asked and why, and what saving does.
 */
export function ChangeTermsDialog({ employeeIds, open, onOpenChange, onChanged }: Props) {
  const today = companyToday();
  // The start of this leave year; a person who starts later moves from their start.
  const earliest = `${today.slice(0, 4)}-01-01`;
  const [value, setValue] = useState<{ termsId: string | null; startDate: string }>({
    termsId: null,
    startDate: today,
  });
  const { data: terms } = useQuery(ChangeTermsFormTermsDocument, { skip: !open });
  const input = {
    employeeIds: [...employeeIds],
    termsId: value.termsId ?? "",
    startDate: value.startDate,
  };
  const preview = useQuery(BulkTermsChangePreviewDocument, {
    variables: { input },
    skip: !open || !value.termsId,
    // A save since may have moved some of them.
    fetchPolicy: "network-only",
  });
  const [changeTerms, { loading, error, payloadError, reset }] = usePayloadMutation(
    BulkChangeTermsDocument,
    { update: forgetHistory },
  );
  const termsName = terms?.allTerms.find(({ id }) => id === value.termsId)?.name ?? "";
  const answer = open && value.termsId ? preview.data?.termsChangePreview : undefined;
  const groups = answer && bulkGroups({ ...answer, startDate: value.startDate });
  const close = () => {
    onOpenChange(false);
    setValue({ termsId: null, startDate: companyToday() });
    reset();
  };
  const save = async () => {
    const payload = await changeTerms({ variables: { input } }).catch(() => null);
    if (!payload) return;
    toast(
      bulkSavedToast({
        movedFrom: (payload.moved ?? []).map(({ startDate }) => startDate),
        termsName,
        startDate: value.startDate,
        today,
      }),
    );
    onChanged();
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && (next ? onOpenChange(true) : close())}>
      <DialogContent
        // Long lines scroll, so the actions stay reachable on a small screen.
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        closeLabel={t("changeTerms.cancel")}
      >
        <DialogHeader>
          <DialogTitle>{bulkTitle(employeeIds.length)}</DialogTitle>
        </DialogHeader>
        <ChangeTermsForm
          value={value}
          onChange={setValue}
          earliest={earliest}
          hint={t("changeTerms.bulk.hint")}
          error={errorOf({
            previewFailed: Boolean(preview.error),
            saveError: error ? null : payloadError,
            saveFailed: Boolean(error),
            earliest,
          })}
          disabled={loading}
        />
        {groups && (
          <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            {bulkLines({ termsName, startDate: value.startDate, groups }).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {groups &&
              bulkSaveLine({ count: groups.moving, termsName, startDate: value.startDate })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={loading} onClick={close}>
              {t("changeTerms.cancel")}
            </Button>
            <Button
              disabled={!groups?.moving || preview.loading || loading}
              onClick={() => void save()}
            >
              {t("changeTerms.bulk.submit")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SaveError = BulkChangeTermsMutation["employees"]["changeTerms"]["error"];

/** The form's message: a failed preview, a date before this leave year, or a failed save. */
function errorOf({
  previewFailed,
  saveError,
  saveFailed,
  earliest,
}: {
  previewFailed: boolean;
  saveError: SaveError | null | undefined;
  saveFailed: boolean;
  earliest: string;
}): string | null {
  if (previewFailed) return t("changeTerms.previewFailed");
  if (
    saveError?.__typename === "InvalidInputError" &&
    saveError.fields.some(({ field }) => field === "startDate")
  ) {
    return t("changeTerms.tooEarly", { date: shortDate(earliest) });
  }
  return saveFailed || saveError ? t("changeTerms.failed") : null;
}
