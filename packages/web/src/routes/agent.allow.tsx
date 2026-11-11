import { createFileRoute } from "@tanstack/react-router";

import { AllowAgentPage } from "@/features/mcpAgents";
import { requireFinishedSetup } from "@/features/setup";

/** Opened by Broccoli's OAuth server when a person's own agent asks to act as them. */
export const Route = createFileRoute("/agent/allow")({
  beforeLoad: (gate) => ({ me: requireFinishedSetup(gate) }),
  component: AllowAgentPage,
});
