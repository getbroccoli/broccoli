import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { TimeOffTypePanel } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/time-off/$timeOffTypeId")({
  validateSearch: (search: Record<string, unknown>): { policy?: string } =>
    typeof search.policy === "string" ? { policy: search.policy } : {},
  component: function TimeOffTypePanelPage() {
    const { timeOffTypeId } = Route.useParams();
    const { policy } = Route.useSearch();
    const navigate = useNavigate();
    return (
      <TimeOffTypePanel
        timeOffTypeId={timeOffTypeId}
        policyId={policy ?? null}
        onClose={() => void navigate({ to: "/settings/time-off" })}
      />
    );
  },
});
