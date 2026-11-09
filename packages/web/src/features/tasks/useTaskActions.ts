import { toast } from "sonner";

import {
  CancelTaskDocument,
  MarkTaskDoneDocument,
  ReopenTaskDocument,
  type TaskErrorFragment,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

/**
 * Mark done, with Undo for a few seconds, Reopen and Cancel. Each payload returns the task, which
 * updates in place; the groups it belongs to change when Tasks next loads.
 */
export function useTaskActions() {
  const [markDone, markDoneState] = usePayloadMutation(MarkTaskDoneDocument);
  const [reopen, reopenState] = usePayloadMutation(ReopenTaskDocument);
  const [cancel, cancelState] = usePayloadMutation(CancelTaskDocument);

  const reopenTask = (id: string) =>
    reopen({ variables: { input: { id } } }).then(() => undefined, showFailure);

  return {
    isPending: markDoneState.loading || reopenState.loading || cancelState.loading,
    markDone: (id: string) =>
      markDone({ variables: { input: { id } } }).then(
        () =>
          void toast(t("tasks.markedDone"), {
            action: { label: t("tasks.undo"), onClick: () => void reopenTask(id) },
          }),
        showFailure,
      ),
    reopen: reopenTask,
    /** Resolves true once cancelled; a refusal shows and resolves false. */
    cancel: (id: string, reason: string) =>
      cancel({ variables: { input: { id, reason } } }).then(
        () => true,
        (failure: unknown) => {
          showFailure(failure);
          return false;
        },
      ),
  };
}

/** A refusal such as "This task is already done." in its own words; anything else in ours. */
function showFailure(failure: unknown): void {
  const refused =
    failure instanceof PayloadFailure ? (failure.payloadError as TaskErrorFragment) : null;
  toast.error(refused && "message" in refused ? refused.message : t("tasks.actionFailed"));
}
