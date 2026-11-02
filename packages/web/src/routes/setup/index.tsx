import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { OwnerStep } from "@/features/imports";
import {
  DEFAULT_SETUP_INVITE_SEARCH,
  parseSetupInviteSearch,
  requireSetupPage,
} from "@/features/setup";

/**
 * The last step of self-hosted setup: the browser holding it creates the owner account,
 * around the people its import adds and the invites the owner chose.
 */
export const Route = createFileRoute("/setup/")({
  validateSearch: parseSetupInviteSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_SETUP_INVITE_SEARCH)] },
  beforeLoad: (gate) => {
    requireSetupPage("owner", gate);
  },
  component: function Owner() {
    return <OwnerStep search={Route.useSearch()} />;
  },
});
