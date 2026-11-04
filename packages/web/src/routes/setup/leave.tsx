import { createFileRoute } from "@tanstack/react-router";

import { LeaveStep } from "@/features/imports";
import { requireSetupPage } from "@/features/setup";

/** After Approve: the terms the owner's people work under, and turning leave on as setup finishes. */
export const Route = createFileRoute("/setup/leave")({
  beforeLoad: (gate) => {
    requireSetupPage("leave", gate);
  },
  component: LeaveStep,
});
