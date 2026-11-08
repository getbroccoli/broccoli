import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { TimeOffTypeStack } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/time-off/$timeOffTypeId")({
  component: function TimeOffTypeStackPage() {
    const { timeOffTypeId } = Route.useParams();
    const navigate = useNavigate();
    return (
      <TimeOffTypeStack
        timeOffTypeId={timeOffTypeId}
        onClose={() => void navigate({ to: "/settings/time-off" })}
      />
    );
  },
});
