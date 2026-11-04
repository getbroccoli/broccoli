import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { LeaveStep } from "@/features/imports";
import {
  DEFAULT_SETUP_INVITE_SEARCH,
  parseSetupInviteSearch,
  requireSetupPage,
} from "@/features/setup";

/** After Approve: the terms the owner's people work under, and turning leave on as setup finishes. */
export const Route = createFileRoute("/setup/leave")({
  validateSearch: parseSetupInviteSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_SETUP_INVITE_SEARCH)] },
  beforeLoad: (gate) => {
    requireSetupPage("leave", gate);
  },
  component: function Leave() {
    return <LeaveStep search={Route.useSearch()} />;
  },
});
