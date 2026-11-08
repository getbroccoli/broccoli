import { createFileRoute, Outlet } from "@tanstack/react-router";

import { TimeOffSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/time-off")({
  component: () => (
    <>
      <TimeOffSettings />
      {/* One time off type opens over the list. */}
      <Outlet />
    </>
  ),
});
