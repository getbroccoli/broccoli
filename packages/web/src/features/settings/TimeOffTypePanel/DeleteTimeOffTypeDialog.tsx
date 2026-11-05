import { toast } from "sonner";

import { DeleteTimeOffTypeDocument, TimeOffSettingsDocument } from "@/__generated__/graphql";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeOffType: { id: string; name: string };
  /** Runs once the type is deleted, such as closing its panel. */
  onDeleted: () => void;
};

/** Confirms deleting a time off type nobody has had, with its policies. No undo. */
export function DeleteTimeOffTypeDialog({ open, onOpenChange, timeOffType, onDeleted }: Props) {
  const [deleteType, { loading, error, payloadError, reset }] = usePayloadMutation(
    DeleteTimeOffTypeDocument,
    { refetch: [TimeOffSettingsDocument] },
  );

  const confirm = async () => {
    try {
      await deleteType({ variables: { input: { id: timeOffType.id } } });
    } catch {
      return;
    }
    toast(t("settings.timeOffType.deleted", { name: timeOffType.name }));
    onOpenChange(false);
    onDeleted();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("settings.timeOffType.deleteTitle", { name: timeOffType.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("settings.timeOffType.deleteDetail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {(error || payloadError) && (
          <p role="alert" className="text-sm text-destructive">
            {payloadError?.message ?? t("settings.timeOffType.deleteFailed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("settings.timeOffType.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            onClick={() => void confirm()}
          >
            {t("settings.timeOffType.deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
