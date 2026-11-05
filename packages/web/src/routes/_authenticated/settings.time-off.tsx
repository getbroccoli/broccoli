import { createFileRoute } from "@tanstack/react-router";

import { TimeOffSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/time-off")({
  component: TimeOffSettings,
});
