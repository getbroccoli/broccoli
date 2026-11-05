import { createFileRoute } from "@tanstack/react-router";

import { EmailSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/email")({
  component: EmailSettings,
});
