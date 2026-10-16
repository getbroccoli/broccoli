import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireSetupStep } from "@/features/setup";
import { AppShell } from "@/shell";

/**
 * The auth gate: pages under it need a signed-in user and finished setup, and render in
 * the app shell.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: (gate) => ({ me: requireSetupStep("DONE", gate) }),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
