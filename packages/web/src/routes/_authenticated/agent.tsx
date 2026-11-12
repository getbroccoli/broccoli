import { createFileRoute } from "@tanstack/react-router";

import { YourAgentPage } from "@/features/mcpAgents";

export const Route = createFileRoute("/_authenticated/agent")({
  component: YourAgentPage,
});
