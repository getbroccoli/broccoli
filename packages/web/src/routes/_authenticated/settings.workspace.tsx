import { createFileRoute, redirect } from "@tanstack/react-router";

import { WorkspaceSettings } from "@/features/settings";

/** The workspace's danger zone, for the owner only. */
export const Route = createFileRoute("/_authenticated/settings/workspace")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("RESET_WORKSPACE")) {
      throw redirect({ to: "/settings", replace: true });
    }
  },
  component: WorkspaceSettings,
});
