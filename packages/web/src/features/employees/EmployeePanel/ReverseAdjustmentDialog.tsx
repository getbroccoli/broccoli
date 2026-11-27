import { useId, useState } from "react";
import { toast } from "sonner";

import {
  AllowanceHistoryDocument,
  ReverseAllowanceAdjustmentDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

import { type AllowanceChange, reverseWords } from "./allowanceHistoryText";

type Props = {
  adjustment: Pick<AllowanceChange, "adjustmentId" | "amount" | "recordedAt">;
  balance: { remaining: number; firstName: string; isReader: boolean };
  /** `YYYY-MM-DD` in London, to tell whether the adjustment's date needs its year. */
  today: string;
  /** Runs when the server refuses, such as when someone reversed it meanwhile. */
  onRefused: () => void;
  onClose: () => void;
};

/** Confirms reversing an adjustment, with an optional reason; the adjustment stays in the history. */
export function ReverseAdjustmentDialog({ adjustment, balance, today, onRefused, onClose }: Props) {
  const [reason, setReason] = useState("");
  // The payload updates the card's figures in the cache; only the history needs the server.
  const [reverse, { loading, error, payloadError }] = usePayloadMutation(
    ReverseAllowanceAdjustmentDocument,
    { refetch: [AllowanceHistoryDocument] },
  );
  const words = reverseWords(adjustment, balance, today);
  const hintId = useId();

  const confirm = async () => {
    const comment = reason.trim();
    try {
      await reverse({
        variables: {
          input: { adjustmentId: adjustment.adjustmentId!, ...(comment && { comment }) },
        },
      });
    } catch {
      onRefused();
      return;
    }
    toast(words.done);
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{words.title}</AlertDialogTitle>
          <AlertDialogDescription>{words.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={reason}
          maxLength={1000}
          aria-label={t("people.panel.timeOff.reverse.reason")}
          aria-describedby={hintId}
          placeholder={t("people.panel.timeOff.reverse.reason")}
          onChange={(event) => setReason(event.target.value)}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          {balance.isReader
            ? t("people.panel.timeOff.adjust.commentHintSelf")
            : t("people.panel.timeOff.adjust.commentHint", { name: balance.firstName })}
        </p>
        {(error || payloadError) && (
          <p role="alert" className="text-sm text-destructive">
            {payloadError && payloadError.__typename !== "InvalidInputError"
              ? payloadError.message
              : t("people.panel.timeOff.reverse.failed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{words.keep}</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            focusableWhenDisabled
            onClick={() => void confirm()}
          >
            {words.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
