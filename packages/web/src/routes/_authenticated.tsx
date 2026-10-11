import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/shell";

/**
 * The auth gate: pages under it need a signed-in user and finished setup, and render in
 * the app shell.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context: { me, setupStep }, location }) => {
    if (!me) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
    if (setupStep === "COMPANY") {
      throw redirect({ to: "/setup/company", replace: true });
    }
    return { me };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
