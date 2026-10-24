import type { ApolloCache } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DeleteEmployeeDocument, EmployeesDocument } from "@/__generated__/graphql";
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
import { t } from "@/i18n";

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
  const [failed, setFailed] = useState(false);
  const [deleteEmployee, { loading }] = usePayloadMutation(DeleteEmployeeDocument, {
    refetch: [EmployeesDocument],
  });
  const client = useApolloClient();
  // The panel may close while a removal is pending, such as on browser Back.
  const panelOpen = useRef(false);
  const removed = useRef(false);
  const fullName = `${employee.firstName} ${employee.lastName}`;

  useEffect(() => {
    panelOpen.current = true;
    return () => {
      panelOpen.current = false;
      if (removed.current) forgetEmployee(client.cache, employee.id);
    };
  }, [client, employee.id]);

  const remove = async () => {
    setFailed(false);
    const changeReason = reason.trim();
    try {
      await deleteEmployee({
        variables: { input: { id: employee.id, ...(changeReason && { changeReason }) } },
      });
    } catch {
      setFailed(true);
      return;
    }
    toast(t("people.panel.remove.done", { name: fullName }));
    removed.current = true;
    if (panelOpen.current) onRemoved();
    else forgetEmployee(client.cache, employee.id);
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
            {loading
              ? t("people.panel.remove.pending")
              : t("people.panel.remove.confirm", { name: employee.firstName })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Drops a removed employee from the cache once their panel is gone, so reopening it finds nobody;
 * while the panel is open, evicting them would refetch it.
 */
function forgetEmployee(cache: ApolloCache, id: string) {
  cache.evict({ id: cache.identify({ __typename: "Employee", id }) });
  cache.gc();
}
