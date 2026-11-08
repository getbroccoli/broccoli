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
  /** What stays once the change goes; null: closed. */
  body: string | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Asks before a planned change is cancelled, saying what stays. */
export function CancelChangeDialog({ body, pending, onConfirm, onClose }: Props) {
  return (
    <AlertDialog open={body !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("terms.edit.cancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("terms.edit.keepChange")}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            {t("terms.edit.cancelChange")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
