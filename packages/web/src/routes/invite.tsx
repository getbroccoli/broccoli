import { createFileRoute, redirect } from "@tanstack/react-router";

import { InvitePage } from "@/features/invites";
import { AuthCard } from "@/shell";

/** Opened from an invite: `/invite#<token>`. Once the person joins, the route reload takes them to their profile. */
export const Route = createFileRoute("/invite")({
  beforeLoad: ({ context: { me } }) => {
    if (me?.employee) {
      throw redirect({ to: "/me", replace: true });
    }
  },
  component: () => <InvitePage Card={AuthCard} />,
});
