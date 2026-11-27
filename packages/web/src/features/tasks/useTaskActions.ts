import type { DocumentNode } from "graphql";
import { toast } from "sonner";

import {
  DeleteTaskDocument,
  MarkTaskDoneDocument,
  type TaskErrorFragment,
  type TaskResultInput,
} from "@/__generated__/graphql";
import { PayloadFailure, useCache, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { addTaskHistoryLine, forgetStaleTask } from "./cache";

/**
 * Mark done, with the result a task's form asks for, and Delete for the person who asked. Mark done returns the task, which updates in
 * place; the groups it belongs to change when Tasks next loads. A refusal, such as a change someone
 * made first, shows its reason and loads the task again as it now stands. `refetch` lists the
 * active queries a done task changes outside Tasks, such as the record it decided.
 */
export function useTaskActions({ refetch }: { refetch?: DocumentNode[] } = {}) {
  const cache = useCache();
  const [markDone, markDoneState] = usePayloadMutation(MarkTaskDoneDocument, {
    update: (cache, { data }) => addTaskHistoryLine(cache, data?.tasks.markDone),
    refetch,
  });
  const [deleteTask, deleteState] = usePayloadMutation(DeleteTaskDocument);

  const refused = (id: string) => (failure: unknown) => {
    const payloadError =
      failure instanceof PayloadFailure ? (failure.payloadError as TaskErrorFragment) : null;
    toast.error(payloadError ? payloadError.message : t("tasks.actionFailed"));
    if (payloadError) forgetStaleTask(cache, id);
  };

  return {
    isPending: markDoneState.loading || deleteState.loading,
    /** Resolves true once marked done; a refusal shows and resolves false. */
    markDone: (id: string, result?: TaskResultInput) =>
      markDone({ variables: { input: { id, result } } }).then(
        () => {
          toast(t("tasks.markedDone"));
          return true;
        },
        (failure: unknown) => {
          refused(id)(failure);
          return false;
        },
      ),
    /** Resolves true once deleted, the task gone from the cache; a refusal shows and resolves false. */
    delete: (id: string) =>
      deleteTask({ variables: { input: { id } } }).then(
        () => {
          forgetStaleTask(cache, id);
          toast(t("tasks.deleted"));
          return true;
        },
        (failure: unknown) => {
          refused(id)(failure);
          return false;
        },
      ),
  };
}
