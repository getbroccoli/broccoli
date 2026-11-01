import { createFileRoute } from "@tanstack/react-router";

import { ReadyStep } from "@/features/imports";
import { parseSetupInviteSearch, requireSetupPage } from "@/features/setup";

/** The last step of managed setup: what it adds and the invites it sends, before the owner starts. */
export const Route = createFileRoute("/setup/ready")({
  validateSearch: parseSetupInviteSearch,
  beforeLoad: (gate) => {
    requireSetupPage("ready", gate);
  },
  component: function Ready() {
    return <ReadyStep search={Route.useSearch()} />;
  },
});
