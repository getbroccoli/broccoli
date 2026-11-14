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
  onOpenChange: (open: boolean) => void;
  /** The assignee, whose tasks it leaves. */
  assigneeName: string;
  isPending: boolean;
  /** Resolves true once deleted. */
  onDelete: () => Promise<boolean>;
};

/** Asks the person who asked for a task to confirm deleting it. */
export function DeleteTaskDialog({ open, onOpenChange, assigneeName, isPending, onDelete }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("tasks.deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks.deleteDialog.description", { name: assigneeName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("tasks.deleteDialog.keep")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            focusableWhenDisabled
            onClick={() => void onDelete().then((deleted) => deleted && onOpenChange(false))}
          >
            {t("tasks.deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
