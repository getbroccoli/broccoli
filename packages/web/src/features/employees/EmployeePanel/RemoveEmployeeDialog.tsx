import { useApolloClient } from "@apollo/client/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DeleteEmployeeDocument } from "@/__generated__/graphql";
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
import { Input } from "@/components/ui/input";
import { addHistoryLine } from "@/features/records";
import { t } from "@/i18n";

import { forgetEmployee } from "../cache";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; firstName: string; lastName: string };
  /** Runs once the employee is removed while their panel is still open, such as closing it. */
  onRemoved: () => void;
};

/** Confirms removing an employee, with an optional reason; their history stays. No undo. */
export function RemoveEmployeeDialog({ open, onOpenChange, employee, onRemoved }: Props) {
  const [reason, setReason] = useState("");
  const [deleteEmployee, { loading, error, payloadError }] = usePayloadMutation(
    DeleteEmployeeDocument,
    {
      // The people they managed get a line saying so in their history.
      update: (cache, { data }) => {
        for (const line of data?.employee.delete.reportHistoryLines ?? []) {
          if (line.record) {
            addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: line.record.id, line });
          }
        }
      },
    },
  );
  const failed = Boolean(error || payloadError);
  const client = useApolloClient();
  // The panel may close while a removal is pending, such as on browser Back.
  const mounted = useRef(false);
  const fullName = `${employee.firstName} ${employee.lastName}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const remove = async () => {
    const changeReason = reason.trim();
    try {
      await deleteEmployee({
        variables: { input: { id: employee.id, ...(changeReason && { changeReason }) } },
      });
    } catch {
      return;
    }
    toast(t("people.panel.remove.done", { name: fullName }));
    if (mounted.current) onRemoved();
    forgetEmployee(client.cache, employee.id);
  };

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("people.panel.remove.title", { name: fullName })}</AlertDialogTitle>
          <AlertDialogDescription>{t("people.panel.remove.detail")}</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={reason}
          maxLength={500}
          aria-label={t("people.panel.remove.reason")}
          placeholder={t("people.panel.remove.reason")}
          onChange={(event) => setReason(event.target.value)}
        />
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("people.panel.remove.failed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {t("people.panel.remove.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            focusableWhenDisabled
            onClick={() => void remove()}
          >
            {loading ? t("people.panel.remove.pending") : t("people.panel.remove.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
