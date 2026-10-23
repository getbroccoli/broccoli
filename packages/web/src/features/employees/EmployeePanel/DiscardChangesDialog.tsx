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

type Props = {
  open: boolean;
  count: number;
  name: string;
  onDiscard: () => void;
  onKeepEditing: () => void;
};

/** Asks before leaving a panel with unsaved changes. */
export function DiscardChangesDialog({ open, count, name, onDiscard, onKeepEditing }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onKeepEditing()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === 1
              ? t("people.panel.discard.titleOne")
              : t("people.panel.discard.title", { count: String(count) })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("people.panel.discard.detail", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("people.panel.discard.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {t("people.panel.discard.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
