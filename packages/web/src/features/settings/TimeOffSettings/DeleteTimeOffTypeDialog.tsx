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
  type: { id: string; name: string };
  /** Runs once the type is deleted, such as closing its panel. */
  onDeleted: () => void;
};

/** Confirms deleting a time off type with its rules on every terms. No undo. */
export function DeleteTimeOffTypeDialog({ open, onOpenChange, type, onDeleted }: Props) {
  const [deleteType, { loading, error, payloadError, reset }] = usePayloadMutation(
    DeleteTimeOffTypeDocument,
    { refetch: [TimeOffSettingsDocument] },
  );
  const failed = Boolean(error || payloadError);

  const remove = async () => {
    try {
      await deleteType({ variables: { input: { timeOffTypeId: type.id } } });
    } catch {
      return;
    }
    toast(t("settings.timeOff.delete.done", { name: type.name }));
    onDeleted();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (loading) return;
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("settings.timeOff.delete.title", { name: type.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("settings.timeOff.delete.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {payloadError?.__typename === "ConflictError"
              ? t("settings.timeOff.delete.booked", { name: type.name })
              : t("settings.timeOff.delete.failed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("settings.timeOff.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            focusableWhenDisabled
            onClick={() => void remove()}
          >
            {loading ? t("settings.timeOff.delete.pending") : t("settings.timeOff.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
