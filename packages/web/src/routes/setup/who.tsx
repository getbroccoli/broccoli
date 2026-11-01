import { createFileRoute } from "@tanstack/react-router";

import { WhoStep } from "@/features/imports";
import { parseSetupInviteSearch, requireSetupPage } from "@/features/setup";

/** After Approve: which person the owner is, and who gets an invite when setup finishes. */
export const Route = createFileRoute("/setup/who")({
  validateSearch: parseSetupInviteSearch,
  beforeLoad: (gate) => {
    requireSetupPage("who", gate);
  },
  component: function Who() {
    return <WhoStep search={Route.useSearch()} />;
  },
});
