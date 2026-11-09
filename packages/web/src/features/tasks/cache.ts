import type { ApolloCache } from "@apollo/client";

import { evictRecord } from "@/apollo";
import { addHistoryLine } from "@/features/records";

/**
 * Drops My tasks and this task from the cache after a refused change, such as one someone else
 * made first, so open lists and panels load them again as they now stand.
 */
export function forgetStaleTask(cache: ApolloCache, taskId: string): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "myTasks" });
  // The panel's query may name the task in another spelling, such as an uppercase link.
  evictRecord(cache, "Task", taskId);
}

/** Adds the line a change just wrote to its task's cached history. */
export function addTaskHistoryLine(
  cache: ApolloCache,
  payload:
    | {
        task?: { id: string } | null;
        historyLine?: Parameters<typeof addHistoryLine>[1]["line"] | null;
      }
    | undefined,
): void {
  if (payload?.task && payload.historyLine) {
    addHistoryLine(cache, {
      recordType: "TASK",
      recordId: payload.task.id,
      line: payload.historyLine,
    });
  }
}
