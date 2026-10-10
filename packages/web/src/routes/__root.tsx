import { createRootRoute, Outlet } from "@tanstack/react-router";

import { AppShell, NotFoundPage } from "@/shell";

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFoundPage,
});
