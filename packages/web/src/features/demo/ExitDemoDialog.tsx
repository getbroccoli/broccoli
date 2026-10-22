import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { ExitDemoDocument } from "@/__generated__/graphql";
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

import { resetDemo } from "./demoApi";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Confirms ending the demo: every person is deleted and setup goes back to the company step,
 * where routing sends the owner. The self-hosted demo's owner, who has no account, is deleted
 * too and this browser holds setup again; an owner with an account stays signed in.
 */
export function ExitDemoDialog({ open, onOpenChange }: Props) {
  const { demoExpiresAt } = useRouteContext({ from: "/_authenticated" });
  const [exitDemoMutation] = usePayloadMutation(ExitDemoDocument);
  const [failed, setFailed] = useState(false);
  const [confirm, exiting] = useSessionChange(async () => {
    setFailed(false);
    const exited = demoExpiresAt
      ? await resetDemo()
      : await exitDemoMutation().then(
          () => true,
          () => false,
        );
    setFailed(!exited);
    return exited;
  });

  const changeOpen = (nextOpen: boolean) => {
    if (exiting) return;
    setFailed(false);
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("demo.exit.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("demo.exit.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("demo.exit.error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={exiting}>{t("demo.exit.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={exiting}
            // Keeps focus in the dialog while it resets, so a failed exit can be retried with Enter.
            focusableWhenDisabled
            onClick={confirm}
          >
            {exiting ? t("demo.exit.pending") : t("demo.exit.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
