import { createFileRoute, Outlet } from "@tanstack/react-router";

import { LocationSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/locations")({
  component: () => (
    <>
      <LocationSettings />
      {/* One location, or a new one, opens over the table. */}
      <Outlet />
    </>
  ),
});
