import { DisconnectAgentDocument } from "@/__generated__/graphql";
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

import { showAgentDisconnected } from "../cache";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: { id: string; client: string };
};

/** Confirms ending the person's agent connection; its next call is refused. */
export function DisconnectAgentDialog({ open, onOpenChange, connection }: Props) {
  const { client } = connection;
  const [disconnect, { loading, error, reset }] = usePayloadMutation(DisconnectAgentDocument, {
    update: (cache, { data }) =>
      showAgentDisconnected(cache, {
        connectionId: connection.id,
        ended: data?.mcpAgents.disconnect.endedAgentConnection ?? null,
      }),
  });

  const confirm = async () => {
    try {
      await disconnect();
    } catch {
      return;
    }
    onOpenChange(false);
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
          <AlertDialogTitle>{t("mcpAgents.disconnect.title", { client })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("mcpAgents.disconnect.detail", { client })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("mcpAgents.disconnect.failed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {t("mcpAgents.disconnect.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            focusableWhenDisabled
            onClick={() => void confirm()}
          >
            {loading ? t("mcpAgents.disconnect.pending") : t("mcpAgents.disconnect.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
