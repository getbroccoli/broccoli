import { useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";

import { MyTasksDocument } from "@/__generated__/graphql";

import { countTasksNeedingYou } from "./taskText";

/** How many tasks wait on the signed-in person; null until Tasks has loaded. */
export function useTasksNeedingYou(): number | null {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const { data } = useQuery(MyTasksDocument, { fetchPolicy: "cache-first" });
  return data ? countTasksNeedingYou(data.myTasks, me.employee?.id ?? null) : null;
}
