import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router";

import {
  DEFAULT_EMPLOYEE_PANEL_SEARCH,
  EmployeePanel,
  employeePanelSearch,
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
        onClose={() =>
          void navigate({
            to: "/people",
            // The list keeps its own search; the panel's tab leaves with the panel.
            search: ({ q, sort, dir, after }) => ({ q, sort, dir, after }),
          })
        }
      />
    );
  },
});
