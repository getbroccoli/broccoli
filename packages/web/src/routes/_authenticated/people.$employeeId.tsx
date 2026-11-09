import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router";

import {
  DEFAULT_EMPLOYEE_PANEL_SEARCH,
  EmployeePanel,
  employeePanelSearch,
  listSearchOf,
} from "@/features/employees";

export const Route = createFileRoute("/_authenticated/people/$employeeId")({
  validateSearch: employeePanelSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_EMPLOYEE_PANEL_SEARCH)] },
  component: function EmployeePanelPage() {
    const { employeeId } = Route.useParams();
    const navigate = useNavigate();
    return (
      <EmployeePanel
        employeeId={employeeId}
        onClose={() => void navigate({ to: "/people", search: listSearchOf })}
      />
    );
  },
});
