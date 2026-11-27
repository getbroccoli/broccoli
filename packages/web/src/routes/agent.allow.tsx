import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AllowAgentPage } from "@/features/mcpAgents";
import { requireFinishedSetup } from "@/features/setup";

/**
 * Opened by Broccoli's OAuth server when a person's own agent asks to act as them, with the
 * agent's request, signed by the server, as one opaque `request` value.
 */
export const Route = createFileRoute("/agent/allow")({
  validateSearch: z.object({ request: z.string().catch("") }),
  beforeLoad: (gate) => {
    const me = requireFinishedSetup(gate);
    // Allowing an agent stays the signed-in user's own business, never done as someone else.
    if (me.actingAs) throw redirect({ to: "/", replace: true });
    return { me };
  },
  component: function AllowAgentRoute() {
    return <AllowAgentPage signedRequest={Route.useSearch().request} />;
  },
});
