import { createFileRoute } from "@tanstack/react-router";

import { TimeOffPage, timeOffSearch } from "@/features/timeOff";

export const Route = createFileRoute("/_authenticated/time-off")({
  validateSearch: timeOffSearch,
  component: TimeOffPage,
});
