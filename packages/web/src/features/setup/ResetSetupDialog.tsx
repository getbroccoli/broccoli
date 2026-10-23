import { useState } from "react";

import { ResetSetupDocument } from "@/__generated__/graphql";
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
import { t } from "@/i18n";
import { useSessionChange } from "@/lib/useSessionChange";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Confirms resetting a finished setup: every person is deleted and setup goes back to the
 * company step, where routing sends the owner, who stays signed in.
 */
export function ResetSetupDialog({ open, onOpenChange }: Props) {
  const [resetSetup] = usePayloadMutation(ResetSetupDocument);
  const [failed, setFailed] = useState(false);
  const [confirm, resetting] = useSessionChange(async () => {
    setFailed(false);
    const reset = await resetSetup().then(
      () => true,
      () => false,
    );
    setFailed(!reset);
    return reset;
  });

  const changeOpen = (nextOpen: boolean) => {
    if (resetting) return;
    setFailed(false);
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("setup.reset.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("setup.reset.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.reset.error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetting}>{t("setup.reset.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={resetting}
            // Keeps focus in the dialog while it resets, so a failed reset can be retried with Enter.
            focusableWhenDisabled
            onClick={confirm}
          >
            {resetting ? t("setup.reset.pending") : t("setup.reset.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
