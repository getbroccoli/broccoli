import type { DocumentNode } from "graphql";

import { type ImportSourceKind, RemoveSourceDocument } from "@/__generated__/graphql";
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

import { forgetSlackConnection } from "./cache";

type Props = {
  /** The source to remove; null keeps the dialog closed. */
  source: { id: string; kind: ImportSourceKind; name: string } | null;
  onClose: () => void;
  /** The page's queries to load again once the source is gone. */
  refetch?: DocumentNode[];
};

/** Asks before removing a source and its people; removing Slack also disconnects it. */
export function RemoveSourceDialog({ source, onClose, refetch }: Props) {
  const [removeSource, { loading, error, payloadError, reset }] = usePayloadMutation(
    RemoveSourceDocument,
    // With the source, so the import page never shows Slack's row connected without its people.
    { refetch, update: source?.kind === "SLACK" ? forgetSlackConnection : undefined },
  );

  const changeOpen = (open: boolean) => {
    if (open || loading) return;
    reset();
    onClose();
  };

  // On failure the dialog stays open and shows the error.
  const confirm = async () => {
    if (!source) return;
    try {
      await removeSource({ variables: { sourceId: source.id } });
      onClose();
    } catch {
      // Shown through `error` or `payloadError`.
    }
  };

  return (
    <AlertDialog open={source !== null} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("imports.removeSource.title", { name: source?.name ?? "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              source?.kind === "SLACK"
                ? "imports.removeSource.slackDetail"
                : "imports.removeSource.fileDetail",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(error || payloadError) && (
          <p role="alert" className="text-sm text-destructive">
            {t("imports.removeSource.error")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {t("imports.removeSource.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            // Keeps focus in the dialog while it removes, so a failed removal can be retried with Enter.
            focusableWhenDisabled
            onClick={() => void confirm()}
          >
            {loading ? t("imports.removeSource.pending") : t("imports.removeSource.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
