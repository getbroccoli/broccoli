import { createFileRoute, Outlet } from "@tanstack/react-router";

import { TermsSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/terms")({
  component: () => (
    <>
      <TermsSettings />
      {/* One set of terms opens over the list. */}
      <Outlet />
    </>
  ),
});
