import { createFileRoute, Outlet } from "@tanstack/react-router";

import { TimeOffSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/time-off")({
  component: () => (
    <>
      <TimeOffSettings />
      {/* A time off type's panel opens over the list. */}
      <Outlet />
    </>
  ),
});
