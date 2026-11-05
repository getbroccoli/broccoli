import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { TimeOffStep } from "@/features/imports";
import {
  DEFAULT_SETUP_INVITE_SEARCH,
  parseSetupInviteSearch,
  requireSetupPage,
} from "@/features/setup";

/** After Approve: the terms the owner's people work under, and turning time off on as setup finishes. */
export const Route = createFileRoute("/setup/time-off")({
  validateSearch: parseSetupInviteSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_SETUP_INVITE_SEARCH)] },
  beforeLoad: (gate) => {
    requireSetupPage("timeOff", gate);
  },
  component: function TimeOff() {
    return <TimeOffStep search={Route.useSearch()} />;
  },
});
