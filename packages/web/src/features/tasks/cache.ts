import type { ApolloCache } from "@apollo/client";

/**
 * Drops My tasks and this task from the cache after a refused change, such as one someone else
 * made first, so open lists and panels load them again as they now stand.
 */
export function forgetStaleTask(cache: ApolloCache, taskId: string): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "myTasks" });
  cache.evict({ id: "ROOT_QUERY", fieldName: "task", args: { id: taskId } });
}
