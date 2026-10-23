import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { EmployeePanel } from "@/features/employees";

export const Route = createFileRoute("/_authenticated/people/$employeeId")({
  component: function EmployeePanelPage() {
    const { employeeId } = Route.useParams();
    const navigate = useNavigate();
    return (
      <EmployeePanel
        employeeId={employeeId}
        onClose={() => void navigate({ to: "/people", search: (previous) => previous })}
      />
    );
  },
});
