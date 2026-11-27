import { useState } from "react";
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
  onClose: () => void;
};

/** Confirms reversing an adjustment, with an optional reason; the adjustment stays in the history. */
export function ReverseAdjustmentDialog({ adjustment, balance, onClose }: Props) {
  const [reason, setReason] = useState("");
  // The payload updates the card's figures in the cache; only the history needs the server.
  const [reverse, { loading, error, payloadError }] = usePayloadMutation(
    ReverseAllowanceAdjustmentDocument,
    { refetch: [AllowanceHistoryDocument] },
  );
  const words = reverseWords(adjustment, balance);

  const confirm = async () => {
    const comment = reason.trim();
    try {
      await reverse({
        variables: {
          input: { adjustmentId: adjustment.adjustmentId!, ...(comment && { comment }) },
        },
      });
    } catch {
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
          placeholder={t("people.panel.timeOff.reverse.reason")}
          onChange={(event) => setReason(event.target.value)}
        />
        {(error || payloadError) && (
          <p role="alert" className="text-sm text-destructive">
            {payloadError?.message ?? t("people.panel.timeOff.reverse.failed")}
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
