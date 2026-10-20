import { useApolloClient } from "@apollo/client/react";
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
import { t } from "@/i18n";
import { postJson } from "@/lib/postJson";
import { useRouteAction } from "@/lib/useRouteAction";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Confirms ending the demo and taking setup back to the company step; this browser then
 * holds setup again, and the routing sends it there. Opened from the workspace menu.
 */
export function ResetDemoDialog({ open, onOpenChange }: Props) {
  const apolloClient = useApolloClient();
  const [run, resetting] = useRouteAction();
  const [failed, setFailed] = useState(false);

  const changeOpen = (nextOpen: boolean) => {
    if (resetting) return;
    setFailed(false);
    onOpenChange(nextOpen);
  };

  const confirm = () => {
    setFailed(false);
    run(async () => {
      const reset = await postJson("/api/auth/setup/demo/reset", {}).then(
        (response) => response.ok,
        () => false,
      );
      if (!reset) {
        setFailed(true);
        return false;
      }
      await apolloClient.clearStore();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("demo.reset.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("demo.reset.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("demo.reset.error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetting}>{t("demo.reset.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={resetting}
            // Keeps focus in the dialog while it resets, so a failed reset can be retried with Enter.
            focusableWhenDisabled
            onClick={confirm}
          >
            {resetting ? t("demo.reset.pending") : t("demo.reset.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
