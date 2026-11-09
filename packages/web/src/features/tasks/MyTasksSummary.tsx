import { t } from "@/i18n";

import { useTasksNeedingYou } from "./useTasksNeedingYou";

/** The line under the page title: how many tasks need the signed-in person. */
export function MyTasksSummary() {
  const count = useTasksNeedingYou();
  if (count === null) return null;
  if (count === 0) return t("tasks.summary.none");
  return count === 1 ? t("tasks.summary.one") : t("tasks.summary.many", { count: String(count) });
}
