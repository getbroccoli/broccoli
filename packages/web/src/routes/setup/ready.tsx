import { createFileRoute } from "@tanstack/react-router";

import { ReadyStep } from "@/features/imports";
import { requireSetupStep } from "@/features/setup";

/** The last step of managed setup: what it added, before the owner starts using Broccoli. */
export const Route = createFileRoute("/setup/ready")({
  beforeLoad: (gate) => {
    requireSetupStep("READY", gate);
  },
  component: ReadyStep,
});
