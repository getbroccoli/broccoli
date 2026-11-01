import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { WhoStep } from "@/features/imports";
import {
  DEFAULT_SETUP_INVITE_SEARCH,
  parseSetupInviteSearch,
  requireSetupPage,
} from "@/features/setup";

/** After Approve: which person the owner is, and who gets an invite when setup finishes. */
export const Route = createFileRoute("/setup/who")({
  validateSearch: parseSetupInviteSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_SETUP_INVITE_SEARCH)] },
  beforeLoad: (gate) => {
    requireSetupPage("who", gate);
  },
  component: function Who() {
    return <WhoStep search={Route.useSearch()} />;
  },
});
