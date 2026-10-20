import { ArrowCounterClockwise } from "@phosphor-icons/react";
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
import { useRouteAction } from "@/lib/useRouteAction";

/**
 * "Reset setup" on the account and ready steps and its confirmation: setup goes back to the company
 * step, where the routing then sends the owner.
 */
export function ResetSetupDialog() {
  const [open, setOpen] = useState(false);
  const [resetSetup, { error, reset }] = usePayloadMutation(ResetSetupDocument);
  const [run, isResetting] = useRouteAction();

  const changeOpen = (nextOpen: boolean) => {
    if (isResetting) return;
    reset();
    setOpen(nextOpen);
  };

  // On failure the dialog stays open and shows `error`.
  const confirm = () => run(() => resetSetup());

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
          <AlertDialogCancel disabled={isResetting}>{t("setup.reset.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isResetting}
            // Keeps focus in the dialog while it resets, so a failed reset can be retried with Enter.
            focusableWhenDisabled
            onClick={confirm}
          >
            {isResetting ? t("setup.reset.pending") : t("setup.reset.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
