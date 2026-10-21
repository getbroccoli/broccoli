import { useApolloClient } from "@apollo/client/react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ImportReviewDocument, UndoReviewChangeDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  /** The review change the page shows as latest, which the server reverses only while it is. */
  changeId: string;
};

/** Review's one Undo: reverses the latest review change, one per press, back to the sources as read. */
export function UndoReviewChangeButton({ changeId }: Props) {
  const client = useApolloClient();
  const [undo, { loading }] = usePayloadMutation(UndoReviewChangeDocument, {
    refetch: [ImportReviewDocument],
  });

  const undoLatest = () =>
    void undo({ variables: { id: changeId } }).catch(() => {
      // Review changed elsewhere, or the answer was lost after Undo may have run: reload review.
      toast.error(t("setup.review.undoFailed"));
      // A failed reload shows as the review's own load error.
      void client.refetchQueries({ include: [ImportReviewDocument] }).catch(() => undefined);
    });

  return (
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      disabled={loading}
      title={t("setup.review.undoHelp")}
      onClick={undoLatest}
    >
      <ArrowCounterClockwise aria-hidden />
      {t("setup.review.undo")}
    </Button>
  );
}
