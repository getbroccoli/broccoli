import { createFileRoute, Outlet } from "@tanstack/react-router";

import { MyTasks, MyTasksSummary } from "@/features/tasks";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: () => (
    <>
      <PageHeader title={t("tasks.title")} description={<MyTasksSummary />} />
      <MyTasks />
      {/* A task's panel opens over the list. */}
      <Outlet />
    </>
  ),
});
