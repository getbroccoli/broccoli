import { useState } from "react";

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The holder, who reads the reason. */
  holderName: string;
  isPending: boolean;
  /** Cancels with the trimmed reason; resolves true once cancelled. */
  onCancel: (reason: string) => Promise<boolean>;
};

/** Asks the person who asked for a task why they withdraw it; the reason is required. */
export function CancelTaskDialog({ open, onOpenChange, holderName, isPending, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [showRequired, setShowRequired] = useState(false);

  const confirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setShowRequired(true);
      return;
    }
    if (await onCancel(trimmed)) onOpenChange(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPending) return;
        if (!nextOpen) {
          setReason("");
          setShowRequired(false);
        }
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tasks.cancelDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks.cancelDialog.description", { name: holderName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={reason}
          maxLength={500}
          aria-label={t("tasks.cancelDialog.reason")}
          placeholder={t("tasks.cancelDialog.reason")}
          aria-invalid={showRequired}
          aria-describedby={showRequired ? "cancel-task-reason-error" : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        {showRequired && (
          <p id="cancel-task-reason-error" role="alert" className="text-sm text-destructive">
            {t("tasks.cancelDialog.reasonRequired")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("tasks.cancelDialog.keep")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            focusableWhenDisabled
            onClick={() => void confirm()}
          >
            {t("tasks.cancelDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
