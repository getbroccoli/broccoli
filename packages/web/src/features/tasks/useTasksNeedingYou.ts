import { useQuery } from "@apollo/client/react";

import { MyTasksDocument } from "@/__generated__/graphql";

/** How many tasks wait on the signed-in person; null until Tasks has loaded. */
export function useTasksNeedingYou(): number | null {
  const { data } = useQuery(MyTasksDocument, { fetchPolicy: "cache-first" });
  // A task marked done on this page still sits in Needs you until Tasks next loads.
  return data ? data.myTasks.needsYou.filter(({ status }) => status === "TO_DO").length : null;
}
