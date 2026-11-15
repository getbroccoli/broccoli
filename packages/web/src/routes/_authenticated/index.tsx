import { createFileRoute } from "@tanstack/react-router";

import { TodayPage } from "@/features/today";

export const Route = createFileRoute("/_authenticated/")({
  component: TodayPage,
});
