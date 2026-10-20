import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/**
 * "Reset setup" on the account step and its confirmation: setup goes back to the company
 * step, where the routing then sends the owner.
 */
export function ResetSetupDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resetSetup, { loading, error, reset }] = usePayloadMutation(ResetSetupDocument);

  const changeOpen = (nextOpen: boolean) => {
    if (loading) return;
    reset();
    setOpen(nextOpen);
  };

  const confirm = async () => {
    try {
      await resetSetup();
    } catch {
      return; // The dialog stays open and shows `error`.
    }
    await router.invalidate();
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-10 gap-2 px-3 text-destructive hover:text-destructive"
          />
        }
      >
        <ArrowCounterClockwise aria-hidden />
        {t("setup.reset.open")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("setup.reset.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("setup.reset.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.reset.error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("setup.reset.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            // Keeps focus in the dialog while it resets, so a failed reset can be retried with Enter.
            focusableWhenDisabled
            onClick={() => void confirm()}
          >
            {loading ? t("setup.reset.pending") : t("setup.reset.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
