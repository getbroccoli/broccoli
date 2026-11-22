import { createFileRoute, useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { TimeOffTypeStack } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/time-off/$timeOffTypeId")({
  component: function TimeOffTypeStackPage() {
    const { timeOffTypeId } = Route.useParams();
    const navigate = useNavigate();
    const router = useRouter();
    const locationKey = useLocation({ select: ({ state }) => state.__TSR_key });
    return (
      <TimeOffTypeStack
        key={timeOffTypeId}
        timeOffTypeId={timeOffTypeId}
        onClose={() => {
          // A pending route can leave this panel mounted until its session check finishes.
          if (router.latestLocation.state.__TSR_key !== locationKey) return;
          void navigate({ to: "/settings/time-off" });
        }}
      />
    );
  },
});
