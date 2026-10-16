import { useState } from "react";

import { ClearDemoDataDocument } from "@/__generated__/graphql";
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

/** "Clear demo data" and its confirmation; the banner hides itself once the data is gone. */
export function ClearDemoDataDialog() {
  const [open, setOpen] = useState(false);
  const [clearDemoData, { loading, error, reset }] = usePayloadMutation(ClearDemoDataDocument, {
    // Every cached page, search and sort of the list held demo people: drop them all, so
    // the list on screen refetches and any other one fetches fresh when it is opened.
    update: (cache) => {
      cache.evict({ id: "ROOT_QUERY", fieldName: "employees" });
      cache.gc();
    },
  });

  const changeOpen = (nextOpen: boolean) => {
    if (loading) return;
    reset();
    setOpen(nextOpen);
  };

  const confirm = async () => {
    try {
      await clearDemoData();
    } catch {
      // The dialog stays open and shows `error`.
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        {t("demo.banner.clear")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("demo.clear.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("demo.clear.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("demo.clear.error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("demo.clear.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            onClick={() => void confirm()}
          >
            {loading ? t("demo.clear.pending") : t("demo.clear.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
