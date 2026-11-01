import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { ReadyStep } from "@/features/imports";
import {
  DEFAULT_SETUP_INVITE_SEARCH,
  parseSetupInviteSearch,
  requireSetupPage,
} from "@/features/setup";

/** The last step of managed setup: what it adds and the invites it sends, before the owner starts. */
export const Route = createFileRoute("/setup/ready")({
  validateSearch: parseSetupInviteSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_SETUP_INVITE_SEARCH)] },
  beforeLoad: (gate) => {
    requireSetupPage("ready", gate);
  },
  component: function Ready() {
    return <ReadyStep search={Route.useSearch()} />;
  },
});
