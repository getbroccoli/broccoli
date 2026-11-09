import { toast } from "sonner";

import {
  CancelTaskDocument,
  MarkTaskDoneDocument,
  ReopenTaskDocument,
  type TaskErrorFragment,
} from "@/__generated__/graphql";
import { PayloadFailure, useCache, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { forgetStaleTask } from "./cache";

/**
 * Mark done, with Undo for a few seconds, Reopen and Cancel. Each payload returns the task, which
 * updates in place; the groups it belongs to change when Tasks next loads. A refusal, such as a
 * change someone made first, shows its reason and loads the task again as it now stands.
 */
export function useTaskActions() {
  const cache = useCache();
  const [markDone, markDoneState] = usePayloadMutation(MarkTaskDoneDocument);
  const [reopen, reopenState] = usePayloadMutation(ReopenTaskDocument);
  const [cancel, cancelState] = usePayloadMutation(CancelTaskDocument);

  const refused = (id: string) => (failure: unknown) => {
    const payloadError =
      failure instanceof PayloadFailure ? (failure.payloadError as TaskErrorFragment) : null;
    toast.error(payloadError ? payloadError.message : t("tasks.actionFailed"));
    if (payloadError) forgetStaleTask(cache, id);
  };
  const reopenTask = (id: string) =>
    reopen({ variables: { input: { id } } }).then(() => undefined, refused(id));

  return {
    isPending: markDoneState.loading || reopenState.loading || cancelState.loading,
    markDone: (id: string) =>
      markDone({ variables: { input: { id } } }).then(
        () =>
          void toast(t("tasks.markedDone"), {
            action: { label: t("tasks.undo"), onClick: () => void reopenTask(id) },
          }),
        refused(id),
      ),
    reopen: reopenTask,
    /** Resolves true once cancelled; a refusal shows and resolves false. */
    cancel: (id: string, reason: string) =>
      cancel({ variables: { input: { id, reason } } }).then(
        () => true,
        (failure: unknown) => {
          refused(id)(failure);
          return false;
        },
      ),
  };
}
